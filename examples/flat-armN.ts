/**
 * Generic flat N-stage piston extender (N sticky pistons in a row along +x at y=0,z=0; tip stone at x=N; travels N blocks).
 * Same controller idea as flat-arm3.ts, but data driven: every piston tap (stone beside the arm + dust on top, even x
 * on the north side, odd x on the south side) is the OR of any number of sources:
 *   - chain  : the lever signal delayed by `abs` rt (repeater chain)
 *   - pulse  : subtract comparator (rear edge - side edge), clean 15 pulse, both inputs straight from repeaters
 * One trunk (dust + repeater every 8 cells) carries the lever; each chain is shortened by the trunk delay at its branch
 * so every waveform shares the time base K + abs. Lanes (dust columns to the taps) are 2 apart; shallow lanes spread
 * outward (west/east), deeper lanes sit further out, the middle lane is the deepest and takes rows from both sides.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Dir, Pos } from '../src/dirs.ts';
import { opposite } from '../src/dirs.ts';

export interface Hold { x: number; on: number; off: number }
export interface Pulse { x: number; side: number; rear: number }
export interface ArmSpec { n: number; K: number; holds: Hold[]; pulses: Pulse[]; xw: number; xe: number }
/** anything with place(): a World, or an Xf that rotates/mirrors/moves a module into a bigger build */
export interface Placer { place(p: Pos, type: string, props?: Record<string, any>): unknown }
export interface ArmOpts {
  /** every row comes from the west trunk only (module never reaches east of the arm's own cells) */
  oneSided?: boolean;
  /** place the stone tip block (default true). Doors use their own glue blocks as the tip. */
  tip?: boolean;
  /** taps are stone (default) or obsidian (needed next to slime/honey: glue drags stone) */
  tapBlock?: 'stone' | 'obsidian';
  /** no lever: leave a plain input dust cell at the returned `input` position */
  noLever?: boolean;
  /** place the arm's sticky pistons at y=0 (default true). Stacked doors place their own rows. */
  arm?: boolean;
  /**
   * Ladder mode for stacked rows: piston rows at y=1..H share every tap (lane plane y=1, arm row y=0 is a dummy).
   * Each tap lane ends in a zigzag of dust and hoppers (dust may sit on a hopper; hoppers are non-conductors that
   * pistons cannot move) next to the pistons: dust at z=+-1 on even y powers that row directly and the row below
   * through quasi-connectivity (a piston is also powered when the cell above it would be). Because the supports are
   * non-conductors the zigzag only carries power UP, so it is fed at the bottom (a repeater at lane z=3 gives 15).
   */
  ladder?: number;
}
const FLIP: Record<string, string> = { east: 'west', west: 'east' };
/** Place a module mirrored in x (mx) and moved by o. Facings of repeaters/comparators/pistons are mirrored too. */
export class Xf implements Placer {
  constructor(private w: Placer, private o: Pos, private mx = false) {}
  at(p: Pos): Pos { return [(this.mx ? -p[0] : p[0]) + this.o[0], p[1] + this.o[1], p[2] + this.o[2]]; }
  place(p: Pos, type: string, props: Record<string, any> = {}) {
    const q = { ...props };
    if (this.mx && typeof q.facing === 'string' && FLIP[q.facing]) q.facing = FLIP[q.facing];
    return this.w.place(this.at(p), type, q);
  }
}

/** Mechanical sequence found with scripted power (see knowledge/LEARNINGS.md): 4 stages. */
export const QUAD: ArmSpec = {
  n: 4, K: 12, xw: -20, xe: 26,
  holds: [
    { x: 0, on: 0, off: 19 }, { x: 2, on: 3, off: 15 }, { x: 4, on: 6, off: 12 }, { x: 6, on: 9, off: 9 },
  ],
  pulses: [
    { x: 5, side: 16, rear: 19 }, { x: 3, side: 20, rear: 23 }, { x: 4, side: 24, rear: 27 },
    { x: 1, side: 28, rear: 31 }, { x: 2, side: 32, rear: 35 }, { x: 3, side: 36, rear: 39 },
  ],
};

/** N=2: P1 on 0, P2 on 3; off P2 (3), P1 (7); then one pulse of P2 at tap x1 pulls the tip home. */
export const DOUBLE: ArmSpec = {
  n: 2, K: 6, xw: -12, xe: 16,
  holds: [{ x: 0, on: 0, off: 8 }, { x: 2, on: 3, off: 3 }],
  pulses: [{ x: 1, side: 12, rear: 15 }],
};

/** N=5 (quint). Pulse order found by searching the simulator: 7 5 3 1 6 4 2 5 3 4 (taps), 4 rt apart. */
export const QUINT: ArmSpec = {
  n: 5, K: 16, xw: -34, xe: 40,
  holds: [
    { x: 0, on: 0, off: 25 }, { x: 2, on: 3, off: 21 }, { x: 4, on: 6, off: 18 }, { x: 6, on: 9, off: 15 }, { x: 8, on: 12, off: 12 },
  ],
  pulses: [7, 5, 3, 1, 6, 4, 2, 5, 3, 4].map((x, i) => ({ x, side: 19 + 4 * i, rear: 22 + 4 * i })),
};

/** N=3 in the generic format (same waveforms as examples/flat-arm3.ts): P1 0/13, P2 3/9, P3 6; pulses P3@x3, P2@x1, P3@x2. */
export const TRIPLE: ArmSpec = {
  n: 3, K: 10, xw: -16, xe: 22,
  holds: [{ x: 0, on: 0, off: 13 }, { x: 2, on: 3, off: 9 }, { x: 4, on: 6, off: 6 }],
  pulses: [{ x: 3, side: 12, rear: 15 }, { x: 1, side: 16, rear: 19 }, { x: 2, side: 19, rear: 22 }],
};

type XZ = [number, number];
const dirOf = (a: XZ, b: XZ): Dir => (b[0] > a[0] ? 'east' : b[0] < a[0] ? 'west' : b[1] > a[1] ? 'south' : 'north');
const line = (a: XZ, b: XZ): XZ[] => {
  const out: XZ[] = [];
  const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
  for (let p: XZ = [a[0], a[1]]; ; p = [p[0] + dx, p[1] + dz]) { out.push([p[0], p[1]]); if (p[0] === b[0] && p[1] === b[1]) break; }
  return out;
};

interface Src { kind: 'chain' | 'pulse'; abs: number; side?: number; dx: number; z: number; }
interface Lane { x: number; s: number; srcs: Src[]; deep: number }

export function buildFlatArm(w: Placer, spec: ArmSpec, opts: ArmOpts = {}): { lever: Pos; input: Pos; tip: Pos } {
  const { K, xw, xe } = spec;
  const one = !!opts.oneSided;
  // ---------- plan ----------
  const lanes: Lane[] = [];
  for (let x = 0; x < 2 * spec.n - 1 + 1; x++) {
    const srcs: Src[] = [];
    for (const h of spec.holds) if (h.x === x) { srcs.push({ kind: 'chain', abs: h.on, dx: 0, z: 0 }); if (h.off !== h.on) srcs.push({ kind: 'chain', abs: h.off, dx: 0, z: 0 }); }
    for (const p of spec.pulses) if (p.x === x) srcs.push({ kind: 'pulse', abs: p.rear, side: p.side, dx: 0, z: 0 });
    if (srcs.length) lanes.push({ x, s: x % 2 === 0 ? -1 : 1, srcs, deep: 0 });
  }
  let zTop = 0, zBot = 0;
  for (const s of [-1, 1]) {
    const L = lanes.filter((l) => l.s === s).sort((a, b) => a.x - b.x);
    const half = one ? L.length : Math.floor(L.length / 2);
    const west = L.slice(0, half), east = one ? [] : L.slice(L.length - half).reverse(), mid = !one && L.length % 2 ? L[half] : null;
    let curW = 2, curE = 2;
    const alloc = (lane: Lane, dxs: number[], cur: number): number => {
      lane.srcs.forEach((src, i) => {
        src.dx = dxs[i % dxs.length]; src.z = s * cur;
        cur += src.kind === 'pulse' ? 4 : 2;
        lane.deep = Math.max(lane.deep, Math.abs(src.z) + (src.kind === 'pulse' ? 2 : 0));
      });
      return cur;
    };
    for (const l of west) curW = alloc(l, [1], curW);
    for (const l of east) curE = alloc(l, [-1], curE);
    if (mid) alloc(mid, [1, -1], Math.max(curW, curE));
    const deepest = Math.max(0, ...L.map((l) => l.deep));
    if (s < 0) zTop = -(deepest + 3); else zBot = deepest + 3;
  }

  // ---------- placement helpers ----------
  const floor = new Set<string>();
  const under = (x: number, z: number) => { const k = `${x},${z}`; if (!floor.has(k)) { floor.add(k); w.place([x, 0, z], 'obsidian'); } };
  const dust = (x: number, z: number) => { under(x, z); w.place([x, 1, z], 'redstone_wire'); };
  const rep = (x: number, z: number, out: Dir, delay: number) => { under(x, z); w.place([x, 1, z], 'repeater', { facing: opposite(out), delay }); };
  const cmp = (x: number, z: number, out: Dir) => { under(x, z); w.place([x, 1, z], 'comparator', { facing: opposite(out), mode: 'subtract' }); };

  // ---------- arm + taps ----------
  if (opts.arm !== false) for (let x = 0; x < spec.n; x++) w.place([x, 0, 0], 'sticky_piston', { facing: 'east' });
  if (opts.tip !== false && opts.arm !== false) w.place([spec.n, 0, 0], 'stone');
  for (const l of lanes) { if (opts.ladder) continue; floor.add(`${l.x},${l.s}`); w.place([l.x, 0, l.s], opts.tapBlock ?? 'stone'); }

  // ---------- trunk ----------
  const xc = one ? xw : Math.floor((xw + xe) / 2);
  const attach = new Set<string>();
  const rowZ = (l: Lane, src: Src): number[] => (src.kind === 'pulse' ? [src.z, src.z + 2 * l.s] : [src.z]);
  for (const l of lanes) for (const src of l.srcs) for (const z of rowZ(l, src)) attach.add(`${src.dx > 0 ? xw : xe},${z}`);
  attach.add(`${xc},${zTop}`);
  const trunkDelay = new Map<string, number>();
  const lay = (path: XZ[]) => {
    let count = 0, since = 0;
    path.forEach((c, i) => {
      const key = `${c[0]},${c[1]}`;
      trunkDelay.set(key, count);
      const prev = path[i - 1], next = path[i + 1];
      since++;
      if (since >= 8 && prev && next && dirOf(prev, c) === dirOf(c, next) && !attach.has(key)) { rep(c[0], c[1], dirOf(c, next), 1); count++; since = 0; }
      else dust(c[0], c[1]);
    });
  };
  lay(one ? line([xw, zTop], [xw, zBot]) : [...line([xc, zTop], [xw, zTop]), ...line([xw, zTop + 1], [xw, zBot])]);
  if (!one) lay([...line([xc, zTop], [xe, zTop]), ...line([xe, zTop + 1], [xe, zBot])]);
  floor.add(`${xc},${zTop - 1}`); w.place([xc, 0, zTop - 1], 'obsidian');
  if (opts.noLever) w.place([xc, 1, zTop - 1], 'redstone_wire');
  else w.place([xc, 1, zTop - 1], 'lever', { face: 'floor' });
  const td = (x: number, z: number) => trunkDelay.get(`${x},${z}`) ?? 0;

  // ---------- sources ----------
  /** repeater/dust row: `cells` in flow order, ending into `into`. repeaters at the end when `tail` is false (comparator inputs) */
  const row = (cells: XZ[], D: number, outLast: Dir, repeatersLast: boolean, what: string) => {
    if (process.env.ARM_DEBUG) console.log(`${what}: D=${D} cells=${cells.length}`);
    if (D < 1) throw new Error(`${what}: delay ${D} < 1 (raise K)`);
    // repeaters spaced evenly along the row (never more than ~8 dust cells apart, dust dies after 15), delays 1..4 each
    const n = Math.min(cells.length, D, Math.max(Math.ceil(D / 4), Math.ceil(cells.length / 8)));
    if (D > 4 * n) throw new Error(`${what}: delay ${D} does not fit ${cells.length} cells (widen xw/xe)`);
    const d = Array.from({ length: n }, (_, i) => Math.floor(D / n) + (i < D % n ? 1 : 0));
    const at = new Map<number, number>();
    for (let j = 0; j < n; j++) at.set(Math.round(((j + 1) * cells.length) / n) - 1, d[j]);
    void repeatersLast;
    cells.forEach((c, i) => {
      const dl = at.get(i);
      if (dl === undefined) { dust(c[0], c[1]); return; }
      rep(c[0], c[1], i + 1 < cells.length ? dirOf(c, cells[i + 1]) : outLast, dl);
    });
  };
  for (const l of lanes) {
    const farthest = Math.max(...l.srcs.map((s) => Math.abs(s.z)));
    // long lanes lose signal (15 blocks): a repeater (1 rt) every ~10 cells, never at a cell where a row joins
    const joins = new Set(l.srcs.map((s) => Math.abs(s.z)));
    const laneReps: number[] = [];
    if (opts.ladder && farthest > 3) laneReps.push(3); // strong signal into the ladder
    for (let z = 10; z < farthest; z += 10) { let a = z; while (joins.has(a)) a++; if (a < farthest) laneReps.push(a); }
    for (let z = 1; z <= farthest; z++) {
      if (opts.ladder && z === 1) { w.place([l.x, 1, l.s], 'hopper', { facing: 'down' }); continue; }
      if (laneReps.includes(z)) rep(l.x, l.s * z, l.s < 0 ? 'south' : 'north', 1); else dust(l.x, l.s * z);
    }
    const laneDelay = (a: number) => laneReps.filter((r) => r < a).length;
    for (const src of l.srcs) {
      const dx = src.dx, X = dx > 0 ? xw : xe, z = src.z, o = l.s; // o: outward step in z
      const first = X + dx;
      if (src.kind === 'chain') {
        const cells = line([first, z], [l.x - dx, z]);
        row(cells, K + src.abs - td(X, z) - laneDelay(Math.abs(z)), dx > 0 ? 'east' : 'west', false, `chain x${l.x} abs${src.abs}`);
      } else {
        const cx = l.x - 2 * dx;
        dust(l.x - dx, z);
        cmp(cx, z, dx > 0 ? 'east' : 'west');
        const rearCells = line([first, z], [l.x - 3 * dx, z]);
        row(rearCells, K + src.abs - td(X, z) - laneDelay(Math.abs(z)), dx > 0 ? 'east' : 'west', true, `pulse x${l.x} rear${src.abs}`);
        const zs = z + 2 * o;
        dust(cx, zs);
        rep(cx, z + o, o > 0 ? 'north' : 'south', 1); // side repeater: between the side dust and the comparator
        const sideCells = line([first, zs], [l.x - 3 * dx, zs]);
        row(sideCells, K + src.side! - td(X, zs) - 1 - laneDelay(Math.abs(z)), dx > 0 ? 'east' : 'west', true, `pulse x${l.x} side${src.side}`);
      }
    }
  }
  if (opts.ladder) {
    for (const l of lanes) {
      const hop = (p: Pos) => w.place(p, 'hopper', { facing: 'down' });
      for (let y = 2; y <= opts.ladder; y++) {
        const A: Pos = [l.x, y, l.s], B: Pos = [l.x, y, 2 * l.s];
        if (y % 2 === 0) { w.place(A, 'redstone_wire'); hop(B); } else { hop(A); w.place(B, 'redstone_wire'); }
      }
    }
  }
  return { lever: [xc, 1, zTop - 1], input: [xc, 1, zTop - 1], tip: [spec.n, 0, 0] };
}

export const tipXN = (w: World, n: number): number | null => {
  for (let x = -1; x <= 3 * n + 2; x++) if (w.get([x, 0, 0]).type === 'stone') return x;
  return null;
};
export const homeN = (w: World, n: number): boolean =>
  tipXN(w, n) === n && Array.from({ length: n }, (_, x) => x).every((x) => w.get([x, 0, 0]).type === 'sticky_piston' && !w.read([x, 0, 0], 'extended'));

if (process.argv[1]?.endsWith('flat-armN.ts')) {
  const w = new World();
  buildFlatArm(w, QUAD);
  w.run(300);
  writeFileSync('examples/flat-arm4.schem', exportSchem(w).buffer);
  console.log('wrote examples/flat-arm4.schem');
}
