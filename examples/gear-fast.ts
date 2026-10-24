/**
 * Compact, faster diamond gear set (sim only). Same mechanics as gear-set.ts (comparator-locked one-item droppers, pulse timelines,
 * stashes with two metered ports) but:
 *  - the units are packed tightly (positions found by gear-fast-descent.ts, see gear-fast-items.ts), so the hopper conveyors are short;
 *  - there is no START network: the timelines are chained, every timeline starts from the craft pulse (PC) of the stage before it,
 *    after its own pre-delay snake;
 *  - the delays (pre-delay snakes, PC gaps) are calibrated: the machine is built, START is simulated without items, the pulse times at
 *    every pin are measured and gear-fast-plan.ts moves every timeline to the moment its items are there (a few rounds).
 * Platform (inputs, START button, OUTPUT and LEFTOVER chests) and the two item lifts are built by buildPlatform().
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { Board, route, assignRepeaters, boostEnd, ensureStrength } from './noglue-lib.ts';
import { buildTimeline, buildHub, KITS } from './gear-kit.ts';
import { buildItems, buildPlatform, DEFAULT_CFG, PAIRS, type Cfg } from './gear-fast-items.ts';
import { plan, type Adj, type SpecInfo, type Meas } from './gear-fast-plan.ts';
import type { Machine } from './gear-set.ts';
import type { Pos } from '../src/dirs.ts';

export function loadCfg(): Cfg {
  const f = new URL('../.cache/fast-cfg.json', import.meta.url);
  const fixed = new URL('./gear-fast-layout.txt', import.meta.url);
  if (existsSync(fixed)) return { ...DEFAULT_CFG, ...JSON.parse(readFileSync(fixed, 'utf8')) };
  if (existsSync(f)) return { ...DEFAULT_CFG, ...JSON.parse(readFileSync(f, 'utf8')) };
  return DEFAULT_CFG;
}

export interface FastMachine extends Machine { specs: SpecInfo[]; hops: Record<string, number>; pinNames: { net: string; pin: Pos; label: string }[] }

/** nominal pre-delays / gaps of the first round (the calibration replaces them) */
function nominal(name: string): { pre: number; gap: number } {
  if (name === 'tDM') return { pre: 0, gap: 3 };
  if (name.startsWith('t_')) return { pre: 22, gap: 8 };
  if (name === 'tP_AB' || name === 'tP_D') return { pre: 12, gap: 6 };
  return { pre: 16, gap: 0 };
}

/** layout variants tried in turn when the router cannot reach a pin (gap between the timelines, width of a shelf row) */
const VARIANTS: { gap: number; roww: number; side?: 'east' }[] = [{ gap: 4, roww: 130 }, { gap: 6, roww: 130 }, { gap: 8, roww: 130 }, { gap: 5, roww: 100 }, { gap: 8, roww: 100 }, { gap: 12, roww: 150 }, { gap: 6, roww: 80 }];

export function buildFast(w: World, cfg: Cfg = loadCfg(), adj: Adj = {}): FastMachine {
  let lastErr: unknown;
  for (const v of VARIANTS) {
    try {
      const sw = new World(); const sm = buildFastOnce(sw, cfg, adj, v);
      const stuck = stuckPins(sw, sm);
      if (stuck.length) throw new Error('a lane stays powered after the press (latch): ' + stuck.slice(0, 3).join(', '));
      return buildFastOnce(w, cfg, adj, v);
    } catch (e) { lastErr = e; if (process.env.DEBUG_PLAN) console.log('variant', JSON.stringify(v), 'failed:', String((e as Error).message).slice(0, 100)); }
  }
  throw lastErr;
}

function buildFastOnce(w: World, cfg: Cfg, adj: Adj, variant: { gap: number; roww: number; side?: 'east' }): FastMachine {
  const b = new Board(w);
  const it = buildItems(b, cfg);
  const plat = buildPlatform(b, it, cfg);
  const hops = it.hops;
  const links: { path: Pos[]; net: string }[] = [];
  const jobs: (() => void)[] = [];
  const pins: { net: string; pin: Pos }[] = [];
  const pinNames: { net: string; pin: Pos; label: string }[] = [];
  const link = (from: Pos, to: Pos, net: string, own: string[], label = net) => {
    pins.push({ net, pin: to }); pinNames.push({ net, pin: to, label });
    jobs.push(() => { b.floorColor = 'orange'; const path = route(b, from, to, net, { own, strict: true, maxNodes: Number(process.env.ROUTE_MAX ?? 400000), levelEnds: net.startsWith('ev_') || net === 'startbtn' }); if (process.env.DEBUG_LINKS) console.log('link', net, from.join(','), '->', to.join(','), path.length, 'cells'); links.push({ path, net }); });
  };

  // ---- timeline specs ----
  const timelines: Machine['timelines'] = [];
  interface Spec extends SpecInfo { noPC: boolean; gapS: number; ty?: number; place?: Pos; pins?: ReturnType<typeof buildTimeline>; opts: { preRt?: number; parallelS?: boolean } }
  const specs: Spec[] = [];
  const spec = (name: string, d: number, s: number, parent: string, o: { parallelS?: boolean; noCrafter?: boolean; noPC?: boolean } = {}): Spec => {
    const nom = nominal(name);
    const pre = adj[name]?.pre ?? nom.pre, gap = adj[name]?.gap ?? nom.gap;
    const sp: Spec = { name, d, s, parent, parallelS: !!o.parallelS, noCrafter: !!o.noCrafter, pre, gap, noPC: !!o.noPC, gapS: 0, opts: { preRt: pre > 0 && parent !== 'START' ? pre : undefined, parallelS: o.parallelS } };
    specs.push(sp); return sp;
  };
  // The machine works one press ahead: the stashes, the sticks and the block crafters' droppers are already loaded when the button is pressed
  // (priming), so the unit timelines start at once. Everything else (blocks -> diamonds, logs -> planks -> sticks, the splitters) prepares the NEXT press.
  spec('tDM', 2, 2, 'START', { parallelS: true, noCrafter: true });   // block release (refills the block crafters); its PC starts the early timelines
  spec('tC2', 1, 0, 'START');
  spec('tP_AB', 2, 0, 'tC2');
  spec('tP_D', 2, 0, 'tC2');
  spec('tS0S', 3, 1, 'tP_AB', { noCrafter: true });
  spec('tc1D', 1, 0, 'tDM'); spec('tc1B', 1, 0, 'tDM');
  spec('tc1A', 1, 0, 'tc1D'); spec('tc1C', 1, 0, 'tc1B');
  spec('tS0D', 6, 3, 'tc1D', { noCrafter: true });
  for (const pr of PAIRS) for (const name of [pr.y, pr.x]) spec(`t_${name}`, KITS[name].diamonds, 0, 'HUB');      // started by the START hubs, not by the prepare chain
  spec('tSD', 2, 2, 'HUB', { parallelS: true, noCrafter: true, noPC: true });       // sticks for pickaxe (Y) and axe (X)
  spec('tSAB', 2, 1, 'HUB', { parallelS: true, noCrafter: true, noPC: true });      // sticks for shovel (Y) and sword (X)
  // height of every timeline: bands (hub, then one per module level)
  const bandOf = (name: string): number => {
    if (['tDM', 'tC2', 'tP_AB', 'tP_D', 'tS0S'].includes(name)) return it.fpB.pulseY[1] + 2;
    const lv = name === 'tc1D' || name === 'tS0D' || name === 'tSD' || name === 't_diamond_pickaxe' || name === 't_diamond_axe' ? 'D'
      : name === 'tc1A' || name === 'tSAB' || name === 't_diamond_shovel' || name === 't_diamond_chestplate' ? 'A'
      : name === 'tc1B' || name === 't_diamond_sword' || name === 't_diamond_leggings' ? 'B' : 'C';
    return cfg.ly[lv] + 2;
  };
  for (const sp of specs) {
    sp.ty = bandOf(sp.name);
    const kids = specs.filter((o) => o.parent === sp.name).length + (sp.name === 'tDM' ? 0 : 0);
    const pins = (sp.noCrafter ? 0 : 1) + kids;
    if (pins === 0) sp.noPC = true;
    (sp.opts as any).pcPins = Math.max(1, Math.min(4, pins));
  }
  // footprint of every timeline (scratch board), then shelf packing per band behind the item side
  const foot = (sp: Spec) => {
    const sw = new World(); const sb = new Board(sw);
    buildTimeline(sb, [0, 0, 0], 'f', sp.d, sp.s, sp.gap, sp.gapS, sp.noPC, { ...sp.opts, oddPC: true });
    const lo = [1e9, 1e9], hi = [-1e9, -1e9];
    for (const k of sb.occ.keys()) { const p = k.split(',').map(Number); lo[0] = Math.min(lo[0], p[0]); hi[0] = Math.max(hi[0], p[0]); lo[1] = Math.min(lo[1], p[2]); hi[1] = Math.max(hi[1], p[2]); }
    return { x0: lo[0], x1: hi[0], z0: lo[1], z1: hi[1] };
  };
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const k of b.occ.keys()) { const p = k.split(',').map(Number); for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], p[i]); bb[i + 3] = Math.max(bb[i + 3], p[i]); } }
  const ROWW = Number(process.env.TLW ?? variant.roww), GAP = Number(process.env.TLGAP ?? variant.gap);
  const bands = [...new Set(specs.map((sp) => sp.ty!))].sort((p, q) => q - p);
  const east = variant.side === 'east';
  const zStart = east ? bb[2] - 4 : bb[5] + 10, xStart = east ? bb[3] + 30 : bb[0];
  for (const band of bands) {
    let cx0 = xStart, rowZ = zStart, rowH = 0;
    for (const sp of specs.filter((o) => o.ty === band)) {
      const f = foot(sp); const wdt = f.x1 - f.x0 + 1 + GAP, len = f.z1 - f.z0 + 1;
      if (cx0 + wdt > xStart + ROWW) { cx0 = xStart; rowZ += rowH + GAP; rowH = 0; }
      sp.place = [cx0 - f.x0, band, rowZ - f.z0];
      cx0 += wdt; rowH = Math.max(rowH, len);
    }
  }
  for (const sp of specs) {
    const t = buildTimeline(b, sp.place!, sp.name, sp.d, sp.s, sp.gap, sp.gapS, sp.noPC, { ...sp.opts, oddPC: true });
    sp.pins = t;
    timelines.push({ name: sp.name, start: t.start, delayRt: sp.pre, PD: t.PD, PS: t.PS, PC: t.PC });
  }
  const T = (n: string) => specs.find((s) => s.name === n)!.pins!;
  /** nets of one timeline (its own parts next to a pin are friendly for the lane that leaves the pin) */
  const tn = (n: string) => [`${n}.tl`, `${n}.tl.in`, `${n}.tl.PC`, `${n}.tl.PD`, `${n}.tl.PS`];
  /** the PC pulse has four pins; a consumer takes the free pin nearest to its destination */
  const used = new Map<string, Set<number>>();
  const takePin = (name: string, dest: Pos): Pos => {
    const t = T(name); const all = [t.PC, ...(t.PCalt ?? [])]; const u = used.get(name) ?? new Set<number>(); used.set(name, u);
    let bi = -1, bd = 1e9;
    all.forEach((p, i) => { if (u.has(i)) return; const d = Math.abs(p[0] - dest[0]) + Math.abs(p[1] - dest[1]) + Math.abs(p[2] - dest[2]); if (d < bd) { bd = d; bi = i; } });
    u.add(bi); return all[bi];
  };

  // ---- START hubs: button -> H0 -> (tDM + H_D + H_A); H_A -> H_B -> H_C; every hub starts the unit timelines of its band ----
  const hubBands: Record<string, number> = { H0: it.fpB.pulseY[1] + 2, HD: cfg.ly.D + 2, HA: cfg.ly.A + 2, HB: cfg.ly.B + 2, HC: cfg.ly.C + 2 };
  const hubs: Record<string, ReturnType<typeof buildHub>> = {};
  for (const [hn, hy] of Object.entries(hubBands)) hubs[hn] = buildHub(b, [xStart - 14, hy, zStart + 6], hn);
  const hubUsed = new Map<string, Set<number>>();
  const takeHub = (hn: string, dest: Pos): Pos => {
    const u = hubUsed.get(hn) ?? new Set<number>(); hubUsed.set(hn, u);
    let bi = -1, bd = 1e9;
    hubs[hn].pins.forEach((p, i) => { if (u.has(i)) return; const d = Math.abs(p[0] - dest[0]) + Math.abs(p[1] - dest[1]) + Math.abs(p[2] - dest[2]); if (d < bd) { bd = d; bi = i; } });
    u.add(bi); return hubs[hn].pins[bi];
  };
  const hubOf: Record<string, string> = {};
  for (const pr of PAIRS) for (const name of [pr.y, pr.x]) hubOf[`t_${name}`] = pr.id === 'D' ? 'HD' : `H${pr.id}`;
  hubOf.tSD = 'HD'; hubOf.tSAB = 'HC';
  const hubLink = (from: string, to: Pos, net: string, ownTo: string[], label: string) => link(takeHub(from, to), to, net, [`${from}.h`, ...ownTo], label);
  link(plat.btnDust, hubs.H0.input, 'startbtn', ['startbtn', 'H0.h'], 'hub_H0');
  hubLink('H0', T('tDM').start, 'startbtn', ['startbtn', ...tn('tDM')], 'start_tDM');
  link(T('tDM').start, T('tC2').start, 'startbtn', ['startbtn', 'tDM.tl.in', 'tC2.tl.in'], 'start_tC2');
  hubLink('H0', hubs.HD.input, 'hubD', ['HD.h'], 'hub_HD');
  hubLink('H0', hubs.HA.input, 'hubA', ['HA.h'], 'hub_HA');
  hubLink('HA', hubs.HB.input, 'hubB', ['HB.h'], 'hub_HB');
  hubLink('HB', hubs.HC.input, 'hubC', ['HC.h'], 'hub_HC');
  for (const sp of specs) if (hubOf[sp.name]) hubLink(hubOf[sp.name], sp.pins!.start, `ev_${sp.name}`, tn(sp.name), `ev_${sp.name}`);
  for (const parent of new Set(specs.filter((o) => o.parent !== 'START' && o.parent !== 'HUB').map((o) => o.parent))) {
    const kids = specs.filter((o) => o.parent === parent);
    kids.forEach((sp) => {
      const from = takePin(parent, sp.pins!.start);
      link(from, sp.pins!.start, `ev_${sp.name}`, [...tn(parent), ...tn(sp.name), ...kids.map((o) => `ev_${o.name}`)]);
    });
  }
  // ---- pulse lanes to the units (the congested module area first) ----
  for (const pr of PAIRS) for (const [role, name] of [['Y', pr.y], ['X', pr.x]] as const) {
    const t = T(`t_${name}`);
    link(t.PD!, role === 'Y' ? it.feed[pr.id].pulseY : it.feed[pr.id].pulseX, `t_${name}.tl.PD`, [`p${pr.id}.${role === 'Y' ? 'py' : 'px'}`, ...tn(`t_${name}`)]);
    link(takePin(`t_${name}`, it.mod[name].pulseC), it.mod[name].pulseC, `t_${name}.tl.PCa`, [`${name}.pc`, ...tn(`t_${name}`)]);
  }
  link(T('tDM').PD!, it.fpB.pulseY, 'tDM.tl.PD', ['bk.py', ...tn('tDM')]); link(T('tDM').PS!, it.fpB.pulseX, 'tDM.tl.PS', ['bk.px', ...tn('tDM')]);
  link(T('tC2').PD!, it.c2.PD, 'tC2.tl.PD', ['c2.pd', ...tn('tC2')]); link(takePin('tC2', it.c2.PC), it.c2.PC, 'tC2.tl.PCa', ['c2.pc', ...tn('tC2')]);
  link(T('tP_AB').PD!, it.fpP.pulseX, 'tP_AB.tl.PD', ['pl.px', ...tn('tP_AB')]); link(takePin('tP_AB', it.c3AB.pulseC), it.c3AB.pulseC, 'tP_AB.tl.PCa', ['c3AB.pc', ...tn('tP_AB')]);
  link(T('tP_D').PD!, it.fpP.pulseY, 'tP_D.tl.PD', ['pl.py', ...tn('tP_D')]); link(takePin('tP_D', it.c3D.pulseC), it.c3D.pulseC, 'tP_D.tl.PCa', ['c3D.pc', ...tn('tP_D')]);
  link(T('tS0S').PD!, it.fpS0S.pulseY, 'tS0S.tl.PD', ['x1.py', ...tn('tS0S')]); link(T('tS0S').PS!, it.fpS0S.pulseX, 'tS0S.tl.PS', ['x1.px', ...tn('tS0S')]);
  for (const pr of PAIRS) {
    link(T(`tc1${pr.id}`).PD!, it.c1[pr.id].PD, `tc1${pr.id}.tl.PD`, [`c1${pr.id}.pd`, ...tn(`tc1${pr.id}`)]); link(takePin(`tc1${pr.id}`, it.c1[pr.id].PC), it.c1[pr.id].PC, `tc1${pr.id}.tl.PCa`, [`c1${pr.id}.pc`, ...tn(`tc1${pr.id}`)]);
  }
  link(T('tS0D').PD!, it.fpS0D.pulseY, 'tS0D.tl.PD', ['x0.py', ...tn('tS0D')]); link(T('tS0D').PS!, it.fpS0D.pulseX, 'tS0D.tl.PS', ['x0.px', ...tn('tS0D')]);
  link(T('tSD').PD!, it.fpSD.pulseY, 'tSD.tl.PD', ['sD.py', ...tn('tSD')]); link(T('tSD').PS!, it.fpSD.pulseX, 'tSD.tl.PS', ['sD.px', ...tn('tSD')]);
  link(T('tSAB').PD!, it.fpSAB.pulseY, 'tSAB.tl.PD', ['sAB.py', ...tn('tSAB')]); link(T('tSAB').PS!, it.fpSAB.pulseX, 'tSAB.tl.PS', ['sAB.px', ...tn('tSAB')]);
  for (const j of jobs) j();
  for (const l of links) {
    const fixStrength = () => { if (!ensureStrength(b, l.path, l.net)) throw new Error(`lane ${l.net} has a stretch of dust that is too long and cannot take a repeater`); };
    if (l.net.startsWith('start') || l.net.startsWith('ev_') || l.net.startsWith('hub')) {
      try { assignRepeaters(b, l.path, l.net, undefined, 6); } catch (e: any) { console.log('WARN no repeaters on', l.net, 'path', l.path.length, String(e.message).slice(0, 80)); }
      if (!boostEnd(b, l.path, l.net, 5)) console.log('WARN no end booster on', l.net);
      if (!boostEnd(b, l.path, l.net, 4, true)) console.log('WARN no start booster on', l.net);
      fixStrength();
      continue;
    }
    assignRepeaters(b, l.path, l.net, undefined, 5);
    fixStrength();
  }

  const mach: FastMachine = {
    b, button: plat.button, blockChest: [it.fpB.chestL, it.fpB.chestR], logChest: it.logChest,
    leftover: [it.lbL, it.lbR], planksStash: it.fpP.chestL, pins,
    lifts: plat.lifts, platform: { diamonds: plat.diamonds, logs: plat.logs, output: plat.output, leftover: plat.leftover, button: plat.button },
    outputs: [plat.output[0]], timelines,
    specs: specs.map(({ name, d, s, parent, parallelS, noCrafter, pre, gap }) => ({ name, d, s, parent, parallelS, noCrafter, pre, gap })), hops, pinNames,
  };
  return mach;
}

/** run START without items and report the pins that are still powered 2600 gt later (a lane that closed a ring latches) */
export function stuckPins(w: World, m: FastMachine, gt = 2600): string[] {
  w.run(40); w.use(m.platform.button); w.run(gt);
  return m.pinNames.filter((p) => (((w.get(p.pin) as any).p?.power ?? 0) as number) > 0).map((p) => p.label);
}

/** simulate START without items and record the rising edges at every pin (gt after the button press) */
export function measure(w: World, m: FastMachine, gt = 2600): Meas {
  const times = new Map<string, number[]>();
  const on = new Map<string, boolean>();
  w.run(40);
  w.use(m.platform.button);
  for (let t = 0; t < gt; t += 2) {
    w.run(2);
    for (const p of m.pinNames) {
      const k = p.label + '@' + p.pin.join(','); const v = (((w.get(p.pin) as any).p?.power ?? 0) as number) > 0;
      if (v && !on.get(k)) { const a = times.get(p.label) ?? []; a.push(t + 2); times.set(p.label, a); }
      on.set(k, v);
    }
  }
  const meas: Meas = {};
  for (const [label, a] of times) meas[label] = a;
  return meas;
}

const sameAdj = (a: Adj, b: Adj) => Object.keys({ ...a, ...b }).every((k) => (a[k]?.pre ?? -1) === (b[k]?.pre ?? -1) && (a[k]?.gap ?? -1) === (b[k]?.gap ?? -1));

/** build, measure, re-plan the delays; repeat until nothing changes (at most `rounds` times). Builds into `w` in the end. */
export function buildCalibrated(w: World, cfg: Cfg = loadCfg(), rounds = 6): FastMachine {
  let adj: Adj = {};
  for (let r = 0; r < rounds; r++) {
    const sw = new World(); const sm = buildFast(sw, cfg, adj);
    const meas = measure(sw, sm);
    const next = plan(sm.specs, adj, meas, sm.hops);
    if (process.env.DEBUG_PLAN) console.log('round', r, JSON.stringify(next));
    if (sameAdj(next, adj)) break;
    adj = next;
  }
  return buildFast(w, cfg, adj);
}

/** the built world is cached (the router and the calibration take a while); the key is a hash of the generator sources and the layout config */
export function loadFast(w: World): FastMachine {
  const files = ['gear-fast.ts', 'gear-fast-plan.ts', 'gear-fast-items.ts', 'gear-parts.ts', 'gear-kit.ts', 'gear-lift.ts', 'noglue-lib.ts'].map((f) => new URL(f, import.meta.url));
  const key = createHash('sha1').update(files.map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')).join('\n') + JSON.stringify(loadCfg()) + [process.env.TLW, process.env.TLGAP].join()).digest('hex');
  const path = new URL('../.cache/gear-fast.json', import.meta.url);
  if (existsSync(path)) {
    const c = JSON.parse(readFileSync(path, 'utf8'));
    if (c.key === key || process.env.GEAR_CACHE_ANY) {
      for (const b of c.blocks) w.setRaw(b.pos, b.type, b.props);
      for (const [pos, off] of c.disabled as [Pos, number[]][]) for (const i of off) w.setSlotDisabled(pos, i, true);
      for (const [pos, inv] of c.items as [Pos, ({ id: string; count: number } | null)[]][]) inv.forEach((it, i) => { if (it) w.setItem(pos, i, it); });
      w.run(40);
      return { ...c.machine, b: { occ: new Map(c.occ) } as any };
    }
  }
  const m = buildCalibrated(w);
  const blocks = w.listBlocks().filter((b) => b.type !== 'moving_piston');
  const disabled = blocks.filter((b) => b.type === 'crafter').map((b) => [b.pos, w.disabledSlots(b.pos)] as [Pos, number[]]);
  const items = blocks.filter((b) => ['chest', 'hopper', 'dropper', 'crafter'].includes(b.type)).flatMap((b) => { const inv = w.items(b.pos); return inv && inv.some(Boolean) && !(b.type === 'chest' && b.props?.type === 'right') ? [[b.pos, inv] as [Pos, any]] : []; });
  const { b: _b, ...machine } = m;
  const occ = [...(m.b as any).occ.entries()].filter(([, t]: any) => t.net).map(([k, t]: any) => [k, { kind: t.kind, net: t.net }]);
  mkdirSync(new URL('../.cache/', import.meta.url), { recursive: true });
  writeFileSync(path, JSON.stringify({ key, blocks, disabled, items, occ, machine }));
  return m;
}

if (process.argv[1]?.endsWith('gear-fast.ts')) {
  const w = new World();
  try {
    const t0 = Date.now();
    const m = process.argv.includes('--nocal') ? buildFast(w) : buildCalibrated(w);
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const b of w.listBlocks()) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], b.pos[i]); hi[i] = Math.max(hi[i], b.pos[i]); }
    console.log('built', w.listBlocks().length, 'blocks;', m.timelines.length, 'timelines; size', hi.map((v, i) => v - lo[i] + 1).join('x'), 'in', ((Date.now() - t0) / 1000).toFixed(0), 's');
    if (process.argv.includes('--export')) { writeFileSync('examples/diamond-gear-set-fast.schem', exportSchem(w).buffer); console.log('wrote examples/diamond-gear-set-fast.schem'); }
  } catch (e: any) { console.log('FAIL', e.message); }
}
