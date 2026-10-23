/**
 * Own glue-free 4x4 piston door (sim only). Run: npx tsx examples/piston-door-4x4-own.ts
 *
 * Doorway x=0..3, y=0..3 in plane z=0 (walk through along z). The 16 door blocks (white wool) rest in nooks around the
 * opening; NO slime/honey and no long extenders: every block is moved by sticky pistons that
 *   - push it ONE cell with a 2 gt pulse (a sticky piston pulsed that short pushes and drops the block), and
 *   - pull it back one cell with a longer (>= 4 gt) pulse.
 * Corner / edge cells take one piston ("M1"). The four inner cells need two cells of travel, so they use a two-piston
 * mover ("M2": P1 shoves P2 + block, P2 pushes the block on; opening = P2 pulls, P1 pulls P2 back, P2 pulls again).
 * Feeders (repeater stacks) use quasi-connectivity so one feeder serves the piston below it (see LEARNINGS).
 * The controller is a timer per cluster: lever -> delay chain -> comparator edge formers -> observer (short push pulse)
 * or long pulse -> feeder stacks.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Dir, Pos } from '../src/dirs.ts';
import { Board, route, assignRepeaters } from './noglue-lib.ts';

export const DOORWAY: Pos[] = [0, 1, 2, 3].flatMap((x) => [0, 1, 2, 3].map((y) => [x, y, 0] as Pos));
const K = 2; // repeaters per feeder stack

export type GroupName = 'P1' | 'P2' | 'M1';
export interface Feeder { cell: [number, number]; side: 1 | -1 }
export interface Pulse { kind: 'close' | 'open'; t: number }
export interface GroupSpec { name: GroupName; feeders: Feeder[]; pulses: Pulse[] }
export interface PistonSpec { pos: [number, number]; face: Dir }
export interface ClusterSpec {
  name: string;
  pistons: PistonSpec[]; blocks: [number, number][];
  groups: GroupSpec[];
  origin: Pos; s: Pos; t: Pos;               // core: L input cell, chain direction, lateral direction
}

const GROUP_COLOR: Record<GroupName, string> = { P1: 'orange', P2: 'yellow', M1: 'lime' };
const add = (p: Pos, d: Pos, k: number): Pos => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
const dirOf = (d: Pos): Dir => (d[0] > 0 ? 'east' : d[0] < 0 ? 'west' : d[2] > 0 ? 'south' : 'north');
const neg = (d: Pos): Pos => [-d[0], -d[1], -d[2]];

/** global schedule (rt after the lever event) at which each pulse must reach the pistons */
export const STEP_CLOSE = 4, STEP_OPEN = 6, LONG = 3;
export const ROW: Record<GroupName, Pulse[]> = {
  P1: [{ kind: 'close', t: 0 }, { kind: 'open', t: 5 * STEP_OPEN }],
  P2: [{ kind: 'close', t: STEP_CLOSE }, { kind: 'open', t: 4 * STEP_OPEN }, { kind: 'open', t: 6 * STEP_OPEN }],
  M1: [{ kind: 'close', t: 4 * STEP_CLOSE }, { kind: 'open', t: 0 }],
};
export const COL: Record<GroupName, Pulse[]> = {
  P1: [{ kind: 'close', t: 2 * STEP_CLOSE }, { kind: 'open', t: 2 * STEP_OPEN }],
  P2: [{ kind: 'close', t: 3 * STEP_CLOSE }, { kind: 'open', t: 1 * STEP_OPEN }, { kind: 'open', t: 3 * STEP_OPEN }],
  M1: [{ kind: 'close', t: 4 * STEP_CLOSE }, { kind: 'open', t: 0 }],
};

export interface Calib { latClose: number; latOpen: number; T0: number; netDelay?: number }
export const CALIB: Calib = { latClose: 5, latOpen: 5, T0: 6 };

export function leftSpec(): ClusterSpec {
  return {
    name: 'L',
    pistons: [
      { pos: [-2, 0], face: 'east' }, { pos: [-2, 3], face: 'east' },
      { pos: [-2, 1], face: 'east' }, { pos: [-3, 1], face: 'east' }, { pos: [-2, 2], face: 'east' }, { pos: [-3, 2], face: 'east' },
    ],
    blocks: [[-1, 0], [-1, 1], [-1, 2], [-1, 3]],
    groups: [
      { name: 'P1', feeders: [{ cell: [-3, 2], side: -1 }], pulses: ROW.P1 },
      { name: 'P2', feeders: [{ cell: [-2, 2], side: 1 }, { cell: [-1, 2], side: 1 }], pulses: ROW.P2 },
      { name: 'M1', feeders: [{ cell: [-2, 4], side: 1 }, { cell: [-2, 0], side: 1 }], pulses: ROW.M1 },
    ],
    origin: [-10, 2, 12], s: [0, 0, 1], t: [1, 0, 0],
  };
}

export interface Built { junctions: Record<string, Pos[]>; nodeTimes: Record<string, number[]> }

export function buildCluster(b: Board, c: ClusterSpec, cal: Calib = CALIB): Built {
  const w = b.w;
  // ---- machine ----
  for (const p of c.pistons) b.raw([p.pos[0], p.pos[1], 0], 'sticky_piston', { facing: p.face }, 'piston', '__piston');
  for (const k of c.blocks) b.raw([k[0], k[1], 0], 'white_wool', {}, 'other');
  // ---- feeder stacks ----
  const junctions: Record<string, Pos[]> = {};
  for (const g of c.groups) {
    const net = `${c.name}.${g.name}`;
    junctions[g.name] = [];
    b.floorColor = 'red';
    for (const f of g.feeders) {
      const [x, y] = f.cell;
      const flow: Dir = f.side > 0 ? 'north' : 'south';
      for (let k = 1; k <= K; k++) b.rep([x, y, f.side * k], flow, 1, net, 'red');
      const j: Pos = [x, y, f.side * (K + 1)];
      b.dust(j, net, 'red');
      junctions[g.name].push(j);
    }
  }
  // ---- core: delay chain + formers ----
  const chainNet = `${c.name}.chain`;
  const { origin: O, s, t } = c;
  const G = (a: number, bb: number): Pos => add(add(O, s, a), t, bb);
  type Tap = { group: GroupSpec; pulse: Pulse; time: number };
  const taps: Tap[] = [];
  for (const g of c.groups) for (const p of g.pulses) taps.push({ group: g, pulse: p, time: p.t + cal.T0 - (p.kind === 'close' ? cal.latClose : cal.latOpen) });
  const times = [...new Set([0, ...taps.map((x) => x.time)])].sort((a, b2) => a - b2);
  if (times[0] < 0) throw new Error('negative tap time; raise T0');
  const nodeA = new Map<number, number>();
  b.floorColor = 'light_blue';
  b.dust(G(0, 0), chainNet); nodeA.set(times[0], 0);
  let a = 0;
  for (let k = 1; k < times.length; k++) {
    const dt = times[k] - times[k - 1];
    const nrep = Math.ceil(dt / 4);
    const gap = Math.max(nrep, 5);
    for (let i = 1; i <= gap - nrep; i++) b.dust(G(a + i, 0), chainNet);
    const base = Math.floor(dt / nrep), rem = dt - base * nrep;
    for (let i = 0; i < nrep; i++) b.rep(G(a + gap - nrep + 1 + i, 0), dirOf(s), base + (i < rem ? 1 : 0), chainNet);
    a += gap + 1;
    b.dust(G(a, 0), chainNet); nodeA.set(times[k], a);
  }
  // ---- formers ----
  const launches: Record<string, Pos[]> = {};
  b.floorColor = 'magenta';
  const fl = (aa: number, bb: number) => G(aa, bb);
  for (const tp of taps) {
    const a0 = nodeA.get(tp.time)!;
    const net = `${c.name}.${tp.group.name}`;
    const sg = tp.pulse.kind === 'close' ? 1 : -1;       // close formers on the +t side, open on the -t side
    const L = (aa: number, lat: number) => fl(a0 + aa, sg * lat);
    const latFlow = dirOf(sg > 0 ? t : neg(t));          // flow direction away from the chain
    const backS = dirOf(neg(s));
    b.dust(L(0, 1), chainNet); b.dust(L(1, 1), chainNet); b.dust(L(2, 1), chainNet);
    if (tp.pulse.kind === 'close') {
      b.dust(L(2, 2), chainNet);
      b.rep(L(1, 2), backS, 2, chainNet);
      b.cmp(L(0, 2), latFlow, net);
      b.dust(L(0, 3), net);
      b.obs(L(0, 4), dirOf(sg > 0 ? neg(t) : t), net);   // watches the output dust, outputs away from it
      b.dust(L(0, 5), net);
      (launches[tp.group.name] ??= []).push(L(0, 5));
    } else {
      b.dust(L(2, 2), chainNet); b.dust(L(2, 3), chainNet);
      b.rep(L(1, 3), backS, 1, chainNet);
      b.rep(L(0, 2), latFlow, 1 + LONG, chainNet);
      b.cmp(L(0, 3), latFlow, net);
      b.dust(L(0, 4), net);
      (launches[tp.group.name] ??= []).push(L(0, 4));
    }
  }
  // ---- nets from the launches to the stack junctions ----
  const routed: { path: Pos[]; net: string }[] = [];
  for (const g of c.groups) {
    const net = `${c.name}.${g.name}`;
    b.floorColor = GROUP_COLOR[g.name];
    const js = junctions[g.name];
    // join non-adjacent junctions of the same group to the first one
    for (let i = 1; i < js.length; i++) {
      const adj = Math.abs(js[i][0] - js[0][0]) + Math.abs(js[i][1] - js[0][1]) + Math.abs(js[i][2] - js[0][2]) === 1;
      if (!adj) routed.push({ path: route(b, js[0], js[i], net), net });
    }
    for (const l of launches[g.name]) routed.push({ path: route(b, l, js[0], net), net });
  }
  // repeaters: boosters every <= 12 cells; equal delay on all launch -> junction routes (junction joins are free)
  const launchRoutes = routed.filter((r) => launchesOf(launches, r.path[0]));
  const need = Math.max(1, ...launchRoutes.map((r) => Math.ceil((r.path.length - 1) / 13)));
  const nd = cal.netDelay ?? need;
  for (const r of routed) {
    if (launchRoutes.includes(r)) assignRepeaters(b, r.path, r.net, nd);
    else assignRepeaters(b, r.path, r.net);
  }
  return { junctions, nodeTimes: Object.fromEntries(c.groups.map((g) => [g.name, taps.filter((x) => x.group === g).map((x) => x.time)])) };
}
const launchesOf = (launches: Record<string, Pos[]>, p: Pos) => Object.values(launches).some((l) => l.some((q) => q[0] === p[0] && q[1] === p[1] && q[2] === p[2]));

export function lead(b: Board, c: ClusterSpec): Pos { return [c.origin[0] - c.s[0], c.origin[1] - c.s[1], c.origin[2] - c.s[2]]; }

if (process.argv[1]?.endsWith('piston-door-4x4-own.ts')) {
  const w = new World(); const b = new Board(w);
  const c = leftSpec();
  const info = buildCluster(b, c);
  console.log('nodes', JSON.stringify(info.nodeTimes), 'blocks', w.listBlocks().length);
  void writeFileSync; void exportSchem;
}
