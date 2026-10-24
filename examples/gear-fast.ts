/**
 * Compact, faster diamond gear set (sim only). Same mechanics as gear-set.ts (comparator-locked one-item droppers, pulse timelines,
 * stashes with two metered ports) but:
 *  - the units are packed tightly (positions found by gear-fast-descent.ts, see gear-fast-items.ts), so the hopper conveyors are short;
 *  - there is no START network: the timelines are chained, every timeline starts from the craft pulse (PC) of the stage before it,
 *    after its own short pre-delay snake;
 *  - the spare-item ports of the splitters pulse at the same moments as the first pulses of the used ports.
 * Platform (inputs, START button, OUTPUT and LEFTOVER chests) and the two item lifts are built by buildPlatform().
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { Board, route, assignRepeaters, boostEnd } from './noglue-lib.ts';
import { buildTimeline, KITS, SLOT_RT } from './gear-kit.ts';
import { buildItems, buildPlatform, DEFAULT_CFG, PAIRS, type Cfg } from './gear-fast-items.ts';
import type { Machine } from './gear-set.ts';
import type { Pos } from '../src/dirs.ts';

const HOP_GT = 8;        // gt per hopper hop
const SLOT_GT = SLOT_RT * 2;

export function loadCfg(): Cfg {
  const f = new URL('../.cache/fast-cfg.json', import.meta.url);
  const fixed = new URL('./gear-fast-layout.txt', import.meta.url);
  if (existsSync(fixed)) return { ...DEFAULT_CFG, ...JSON.parse(readFileSync(fixed, 'utf8')) };
  if (existsSync(f)) return { ...DEFAULT_CFG, ...JSON.parse(readFileSync(f, 'utf8')) };
  return DEFAULT_CFG;
}

export function buildFast(w: World, cfg: Cfg = loadCfg()): Machine {
  const b = new Board(w);
  const it = buildItems(b, cfg);
  const plat = buildPlatform(b, it, cfg);
  const hops = it.hops;
  const links: { path: Pos[]; net: string }[] = [];
  const jobs: (() => void)[] = [];
  const pins: { net: string; pin: Pos }[] = [];
  const link = (from: Pos, to: Pos, net: string, own: string[]) => {
    pins.push({ net, pin: to });
    jobs.push(() => { b.floorColor = 'orange'; const path = route(b, from, to, net, { own, strict: true, levelEnds: net.startsWith('ev_') || net === 'startbtn' }); if (process.env.DEBUG_LINKS) console.log('link', net, from.join(','), '->', to.join(','), path.length, 'cells'); links.push({ path, net }); });
  };

  // ---- timelines: footprints first, then shelf packing behind the item side ----
  const timelines: Machine['timelines'] = [];
  interface Spec { noCrafter?: boolean; ty?: number; name: string; d: number; s: number; gap: number; gapS: number; noPC: boolean; opts: { preRt?: number; parallelS?: boolean }; parent: string; place?: Pos; pins?: ReturnType<typeof buildTimeline> }
  const specs: Spec[] = [];
  const spec = (name: string, d: number, s: number, parent: string, opts: Spec['opts'] = {}, gap = 0, gapS = 0, noPC = false): Spec => {
    const sp: Spec = { name, d, s, gap, gapS, noPC, opts, parent }; specs.push(sp); return sp;
  };
  const gapFor = (...nets: string[]) => Math.max(0, Math.ceil((Math.max(...nets.map((n) => hops[n] ?? 0)) * HOP_GT + 40) / SLOT_GT) - 1);
  // stage 0 (START): block release, log
  // blocks: both ports of the block chest release two blocks (nodes 0 and 1); trunk Y feeds crafters D, A and trunk X feeds B, C.
  // arrival times (gt after START) of the blocks at their crafters decide when the block crafter timelines start.
  const N0 = 44, LOAD = 16, TO_PD = 42, KID = 50;                 // first release pulse, hopper->tap->dropper loading, start->PD, parent start -> child start
  const arr = { D: N0 + 8 * (hops.cvb0 ?? 0) + LOAD, A: N0 + SLOT_GT + 8 * ((hops.cvb0 ?? 0) + (hops.cvb1 ?? 0)) + LOAD, B: N0 + 8 * (hops.cvb2 ?? 0) + LOAD, C: N0 + SLOT_GT + 8 * ((hops.cvb2 ?? 0) + (hops.cvb3 ?? 0)) + LOAD };
  const sOf = (k: keyof typeof arr) => arr[k] - TO_PD + 8;       // start of tc1k so that its PD fires 8 gt after the block arrived
  const sMin = Math.min(sOf('D'), sOf('B'));
  const lastPD = N0 + SLOT_GT;                                    // two release nodes
  const nSlots = Math.max(1, Math.floor((sMin - (lastPD - 14)) / SLOT_GT));
  const gapDM = nSlots - 1;
  const pcKid = lastPD - 14 + nSlots * SLOT_GT;                   // moment the kid pins of tDM fire
  spec('tDM', 2, 2, 'START', { parallelS: true }, gapDM);
  spec('tC2', 1, 0, 'START');
  spec('tP_AB', 2, 0, 'tC2', { preRt: 12 }, gapFor('cvpAB'));
  spec('tP_D', 2, 0, 'tC2', { preRt: 12 }, gapFor('cvpD'));
  spec('tS0S', 3, 1, 'tP_AB', { preRt: 14 }, 0, 0, true);
  const pre = (want: number, base: number) => Math.max(0, Math.ceil((want - base) / 2));
  const preD = pre(sOf('D'), pcKid), preB = pre(sOf('B'), pcKid);
  spec('tc1D', 1, 0, 'tDM', preD > 0 ? { preRt: preD } : {});
  spec('tc1B', 1, 0, 'tDM', preB > 0 ? { preRt: preB } : {});
  const sD = pcKid + 2 * preD, sB = pcKid + 2 * preB;
  const preA = pre(sOf('A'), sD + KID), preC = pre(sOf('C'), sB + KID);
  spec('tc1A', 1, 0, 'tc1D', preA > 0 ? { preRt: preA } : {});
  spec('tc1C', 1, 0, 'tc1B', preC > 0 ? { preRt: preC } : {});
  spec('tS0D', 6, 3, 'tc1D', { preRt: 16 }, 0, 0, false).noCrafter = true;
  const stickNet: Record<string, string> = { diamond_shovel: 'cvsShovel', diamond_sword: 'cvsSword', diamond_pickaxe: 'cvsPick', diamond_axe: 'cvsAxe' };
  for (const pr of PAIRS) for (const name of [pr.y, pr.x]) {
    const k = KITS[name];
    const gapS = k.sticks > 0 ? Math.max(0, Math.ceil((((hops[`cv${name}`] ?? 0) - (hops[stickNet[name]] ?? 0)) * HOP_GT + 100) / SLOT_GT) - 1) : 0;
    const gap = gapFor(`cv${name}`, ...(k.sticks > 0 ? [stickNet[name]] : []));
    spec(`t_${name}`, k.diamonds, k.sticks, pr.id === 'D' ? 'tS0D' : `tc1${pr.id}`, { preRt: pr.id === 'D' ? 12 : 22 }, gap, gapS);
  }
  // height of every timeline = height of the pins it drives (lanes stay nearly flat)
  const ty: Record<string, number> = {
    tDM: it.fpB.pulseY[1], tC2: it.c2.PD[1], tP_AB: it.fpP.pulseX[1], tP_D: it.fpP.pulseY[1], tS0S: it.fpS0S.pulseY[1], tS0D: it.fpS0D.pulseY[1],
  };
  for (const pr of PAIRS) {
    ty[`tc1${pr.id}`] = it.c1[pr.id].PD[1];
    ty[`t_${pr.y}`] = it.mod[pr.y].pulseC[1]; ty[`t_${pr.x}`] = it.mod[pr.x].pulseC[1];
  }
  // bands (height layers of the timelines, one strip each): the hub, then one per module level
  const bandOf = (name: string): number => {
    if (['tDM', 'tC2', 'tP_AB', 'tP_D', 'tS0S'].includes(name)) return it.fpB.pulseY[1] + 2;
    const lv = name.endsWith('D') || name === 'tS0D' || name === 't_diamond_pickaxe' || name === 't_diamond_axe' ? 'D'
      : name === 'tc1A' || name === 't_diamond_shovel' || name === 't_diamond_chestplate' ? 'A'
      : name === 'tc1B' || name === 't_diamond_sword' || name === 't_diamond_leggings' ? 'B' : 'C';
    return cfg.ly[lv] + 2;
  };
  for (const sp of specs) sp.ty = process.env.TLLAYERS === '0' ? 0 : process.env.TLLAYERS === '2' ? (ty[sp.name] >= 4 ? 12 : -8) : bandOf(sp.name);
  // footprint of every timeline (scratch board), then shelf packing per height layer behind the item side
  const foot = (sp: Spec) => {
    const sw = new World(); const sb = new Board(sw);
    if (process.env.DEBUG_LINKS) console.log('foot', sp.name, JSON.stringify(sp.opts), sp.gap, sp.gapS);
    buildTimeline(sb, [0, 0, 0], 'f', sp.d, sp.s, sp.gap, sp.gapS, sp.noPC, { ...sp.opts, oddPC: true });
    const lo = [1e9, 1e9], hi = [-1e9, -1e9];
    for (const k of sb.occ.keys()) { const p = k.split(',').map(Number); lo[0] = Math.min(lo[0], p[0]); hi[0] = Math.max(hi[0], p[0]); lo[1] = Math.min(lo[1], p[2]); hi[1] = Math.max(hi[1], p[2]); }
    if (process.env.DEBUG_LINKS) console.log('foot', sp.name, 'w', hi[0] - lo[0] + 1, 'len', hi[1] - lo[1] + 1);
    return { x0: lo[0], x1: hi[0], z0: lo[1], z1: hi[1] };
  };
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const k of b.occ.keys()) { const p = k.split(',').map(Number); for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], p[i]); bb[i + 3] = Math.max(bb[i + 3], p[i]); } }
  if (process.env.DEBUG_LINKS) console.log('items bbox', bb.join(','));
  const ROWW = Number(process.env.TLW ?? 130), GAP = Number(process.env.TLGAP ?? 4);
  // bands: every height layer gets its own strip behind the item side (strips follow each other along z), timelines of a band side by side
  const bands = [...new Set(specs.map((sp) => sp.ty!))].sort((p, q) => q - p);
  let zNext = bb[5] + 10;
  for (const band of bands) {
    let cx0 = bb[0], rowZ = zNext, rowH = 0;
    for (const sp of specs.filter((o) => o.ty === band)) {
      const f = foot(sp); const wdt = f.x1 - f.x0 + 1 + GAP, len = f.z1 - f.z0 + 1;
      if (cx0 + wdt > bb[0] + ROWW) { cx0 = bb[0]; rowZ += rowH + GAP; rowH = 0; }
      sp.place = [cx0 - f.x0, band, rowZ - f.z0];
      cx0 += wdt; rowH = Math.max(rowH, len);
    }
    if (process.env.TLSTACK === '0') zNext = rowZ + rowH + GAP;
  }
  for (const sp of specs) {
    const t = buildTimeline(b, sp.place!, sp.name, sp.d, sp.s, sp.gap, sp.gapS, sp.noPC, { ...sp.opts, oddPC: true });
    sp.pins = t;
    timelines.push({ name: sp.name, start: t.start, delayRt: sp.opts.preRt ?? 0, PD: t.PD, PS: t.PS, PC: t.PC });
  }
  const T = (n: string) => specs.find((s) => s.name === n)!.pins!;
  /** the PC pulse has four pins; a consumer takes the free pin nearest to its destination */
  const used = new Map<string, Set<number>>();
  const takePin = (name: string, dest: Pos): Pos => {
    const t = T(name); const all = [t.PC, ...(t.PCalt ?? [])]; const u = used.get(name) ?? new Set<number>(); used.set(name, u);
    let bi = -1, bd = 1e9;
    all.forEach((p, i) => { if (u.has(i)) return; const d = Math.abs(p[0] - dest[0]) + Math.abs(p[1] - dest[1]) + Math.abs(p[2] - dest[2]); if (d < bd) { bd = d; bi = i; } });
    u.add(bi); return all[bi];
  };

  // ---- START button -> the two first timelines; chain links from parent PC lanes ----
  link(plat.btnDust, T('tDM').start, 'startbtn', ['startbtn', 'tDM.tl.in']);
  link(T('tDM').start, T('tC2').start, 'startbtn', ['startbtn', 'tDM.tl.in', 'tC2.tl.in']);
  // fan-out: the PC pulse of a timeline has four full-strength pins; the first goes to its crafter (if any), the others start the child timelines
  for (const parent of new Set(specs.filter((o) => o.parent !== 'START').map((o) => o.parent))) {
    const kids = specs.filter((o) => o.parent === parent);
    const P_ = T(parent);
    const hasCrafter = !specs.find((o) => o.name === parent)!.noCrafter;
    kids.forEach((sp, i) => {
      const from = takePin(parent, sp.pins!.start);
      link(from, sp.pins!.start, `ev_${sp.name}`, [`${parent}.tl.PC`, `${sp.name}.tl.in`, ...kids.map((o) => `ev_${o.name}`)]);
    });
  }
  // ---- pulse lanes to the units ----
  link(T('tDM').PD!, it.fpB.pulseY, 'tDM.tl.PD', ['bk.py']); link(T('tDM').PS!, it.fpB.pulseX, 'tDM.tl.PS', ['bk.px']);
  link(T('tC2').PD!, it.c2.PD, 'tC2.tl.PD', ['c2.pd']); link(takePin('tC2', it.c2.PC), it.c2.PC, 'tC2.tl.PCa', ['c2.pc', 'tC2.tl.PC']);
  link(T('tP_AB').PD!, it.fpP.pulseX, 'tP_AB.tl.PD', ['pl.px']); link(takePin('tP_AB', it.c3AB.pulseC), it.c3AB.pulseC, 'tP_AB.tl.PCa', ['c3AB.pc', 'tP_AB.tl.PC']);
  link(T('tP_D').PD!, it.fpP.pulseY, 'tP_D.tl.PD', ['pl.py']); link(takePin('tP_D', it.c3D.pulseC), it.c3D.pulseC, 'tP_D.tl.PCa', ['c3D.pc', 'tP_D.tl.PC']);
  link(T('tS0S').PD!, it.fpS0S.pulseY, 'tS0S.tl.PD', ['x1.py']); link(T('tS0S').PS!, it.fpS0S.pulseX, 'tS0S.tl.PS', ['x1.px']);
  for (const pr of PAIRS) {
    link(T(`tc1${pr.id}`).PD!, it.c1[pr.id].PD, `tc1${pr.id}.tl.PD`, [`c1${pr.id}.pd`]); link(takePin(`tc1${pr.id}`, it.c1[pr.id].PC), it.c1[pr.id].PC, `tc1${pr.id}.tl.PCa`, [`c1${pr.id}.pc`, `tc1${pr.id}.tl.PC`]);
  }
  link(T('tS0D').PD!, it.fpS0D.pulseY, 'tS0D.tl.PD', ['x0.py']); link(T('tS0D').PS!, it.fpS0D.pulseX, 'tS0D.tl.PS', ['x0.px']);
  const stickPort: Record<string, { pin: Pos; own: string }> = {
    diamond_shovel: { pin: it.fpSAB.pulseY, own: 'sAB.py' }, diamond_sword: { pin: it.fpSAB.pulseX, own: 'sAB.px' },
    diamond_pickaxe: { pin: it.fpSD.pulseY, own: 'sD.py' }, diamond_axe: { pin: it.fpSD.pulseX, own: 'sD.px' },
  };
  for (const pr of PAIRS) for (const [role, name] of [['Y', pr.y], ['X', pr.x]] as const) {
    const t = T(`t_${name}`), k = KITS[name];
    link(t.PD!, role === 'Y' ? it.feed[pr.id].pulseY : it.feed[pr.id].pulseX, `t_${name}.tl.PD`, [`p${pr.id}.${role === 'Y' ? 'py' : 'px'}`]);
    if (k.sticks > 0) link(t.PS!, stickPort[name].pin, `t_${name}.tl.PS`, [stickPort[name].own]);
    link(takePin(`t_${name}`, it.mod[name].pulseC), it.mod[name].pulseC, `t_${name}.tl.PCa`, [`${name}.pc`, `t_${name}.tl.PC`]);
  }
  for (const j of jobs) j();
  for (const l of links) {
    if (l.net.startsWith('start') || l.net.startsWith('ev_')) { try { assignRepeaters(b, l.path, l.net, undefined, 6); } catch (e: any) { console.log('WARN no repeaters on', l.net, 'path', l.path.length, String(e.message).slice(0, 80)); }
      if (!boostEnd(b, l.path, l.net, 5)) console.log('WARN no end booster on', l.net);
      if (!boostEnd(b, l.path, l.net, 4, true)) console.log('WARN no start booster on', l.net); continue; }
    assignRepeaters(b, l.path, l.net, undefined, 5);
  }

  const mach: Machine = {
    b, button: plat.button, blockChest: [it.fpB.chestL, it.fpB.chestR], logChest: it.logChest,
    leftover: [it.lbL, it.lbR], planksStash: it.fpP.chestL, pins,
    lifts: plat.lifts, platform: { diamonds: plat.diamonds, logs: plat.logs, output: plat.output, leftover: plat.leftover, button: plat.button },
    outputs: [it.outChest], timelines,
  };
  console.log('hops', JSON.stringify(hops));
  return mach;
}

/** the built world is cached (the router takes a while); the key is a hash of the generator sources and the layout config */
export function loadFast(w: World): Machine {
  const files = ['gear-fast.ts', 'gear-fast-items.ts', 'gear-parts.ts', 'gear-kit.ts', 'gear-lift.ts', 'noglue-lib.ts'].map((f) => new URL(f, import.meta.url));
  const key = createHash('sha1').update(files.map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')).join('\n') + JSON.stringify(loadCfg()) + [process.env.TLSTACK, process.env.TLW, process.env.TLGAP, process.env.TLLAYERS, process.env.TLPITCH].join()).digest('hex');
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
  const m = buildFast(w);
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
    const m = buildFast(w);
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const b of w.listBlocks()) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], b.pos[i]); hi[i] = Math.max(hi[i], b.pos[i]); }
    console.log('built', w.listBlocks().length, 'blocks;', m.timelines.length, 'timelines; size', hi.map((v, i) => v - lo[i] + 1).join('x'), 'in', ((Date.now() - t0) / 1000).toFixed(0), 's');
    if (process.argv.includes('--export')) { writeFileSync('examples/diamond-gear-set-fast.schem', exportSchem(w).buffer); console.log('wrote examples/diamond-gear-set-fast.schem'); }
  } catch (e: any) { console.log('FAIL', e.message); }
}
