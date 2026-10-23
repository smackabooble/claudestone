/**
 * Diamond gear set machine (sim only). Run: npx tsx examples/gear-set.ts
 * Diamond blocks + oak logs -> diamond helmet, chestplate, leggings, boots, sword, pickaxe, axe, shovel.
 * Numbers: 33 diamonds (4 blocks = 36, 3 spare) and 7 sticks (1 log = 8 sticks, 1 spare).
 *
 * Every crafter is fed by droppers that hold exactly one item (comparator-locked taps), so a pulse timeline decides how many
 * items each crafter gets. Shared stashes are double chests with two such ports. The leftover is what stays in the stashes.
 * Hoppers can hold a couple of stray items per port, so the first presses after building "prime" the machine.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { Board, route, assignRepeaters, conveyor } from './noglue-lib.ts';
import { buildFeedPair, buildCrafterMod, buildDirectKit } from './gear-parts.ts';
import { buildTimeline, KITS, SLOT_RT } from './gear-kit.ts';
import type { Pos } from '../src/dirs.ts';

const PITCH = 48;
/** the hub: everything the user touches (inputs, output, button, the leftover sticks) sits in a column at x=HUBX, next to pair D (the leftover diamonds) */
const HX = -36, HZ = -6;        // corner of the hub tower
/*  hub tower: items only ever move DOWN, so the chests the user touches form tiers
 *    tier A (chests at y=10): diamond block chest (HX, HZ) and log chest (HX+16, HZ), button between them
 *    tier B (chests at y=6):  leftover diamonds = stash D (HX, HZ+20) and leftover sticks = stash SAB (HX+16, HZ+20)
 *    tier C (y=-2):           output chest (HX+8, HZ+10), fed by the collector line
 */
export interface Pair { id: string; y: string; x: string }
export const PAIRS: Pair[] = [
  { id: 'D', y: 'diamond_pickaxe', x: 'diamond_axe' },       // 3 + 3 (+3 spare = leftover diamonds)
  { id: 'A', y: 'diamond_shovel', x: 'diamond_chestplate' }, // 1 + 8
  { id: 'B', y: 'diamond_sword', x: 'diamond_leggings' },    // 2 + 7
  { id: 'C', y: 'diamond_boots', x: 'diamond_helmet' },      // 4 + 5
];

export interface Machine {
  b: Board;
  button: Pos;               // press here (stone button) -> START
  blockChest: Pos[];         // double chest of diamond blocks (two halves)
  logChest: Pos;             // chest of logs
  leftoverDiamonds: Pos[]; leftoverSticks: Pos[];
  planksStash: Pos;
  pins: { net: string; pin: Pos }[];   // destination pin of every pulse lane (diagnostics)
  outputs: Pos[];            // collector hoppers of the 8 gear crafters (facing east)
  timelines: { name: string; start: Pos; delayRt: number; PD: Pos | null; PS: Pos | null; PC: Pos }[];
}

export function buildGearSet(w: World): Machine {
  const b = new Board(w);
  const links: { path: Pos[]; net: string }[] = [];
  const jobs: (() => void)[] = [];
  const pins: { net: string; pin: Pos }[] = [];
  const link = (from: Pos, to: Pos, net: string, own: string[]) => {
    pins.push({ net, pin: to });
    jobs.push(() => { b.floorColor = 'orange'; links.push({ path: route(b, from, to, net, { own, strict: true }), net }); });
  };
  const timelines: Machine['timelines'] = [];
  const later: (() => void)[] = [];
  const hops: Record<string, number> = {};
  const cv = (from: Pos, to: Pos, net: string) => { hops[net] = conveyor(b, from, to, net).length; };
  const HOP_GT = 8;    // gt per hopper hop (item latency of a conveyor); GAP_MARGIN covers the pulse-to-craft slack
  const mod: Record<string, ReturnType<typeof buildCrafterMod>> = {};
  const stash: Record<string, Pos[]> = {};

  // ---- hub tower units first (all conveyors are routed afterwards, so nothing can wall a hub unit in) ----
  const feed: Record<string, ReturnType<typeof buildFeedPair>> = {};
  const c1: Record<string, ReturnType<typeof buildDirectKit>> = {};
  const fpB = buildFeedPair(b, [HX, 9, HZ], 'bk');                                        // tier A: block chest + metered port
  const fpP = buildFeedPair(b, [HX + 16, 7, HZ], 'pl');                                   // tier A: planks stash under the log crafter
  const c2 = buildDirectKit(b, [HX + 16, 9, HZ], 'c2', [4], 'down');                     // log -> 4 planks, facing down into the stash
  const fpSAB = buildFeedPair(b, [HX + 16, 5, HZ + 20], 'sAB');                           // tier B: sticks for shovel + sword (leftover sticks)
  const c3AB = buildCrafterMod(b, [HX + 16, 7, HZ + 20], 'c3AB', { enabled: [1, 4], diamonds: 2, sticks: 0 }, 'down');
  feed.D = buildFeedPair(b, [HX, 5, HZ + 20], 'pD');                                      // tier B: pair D stash (leftover diamonds)
  stash.D = [feed.D.chestL, feed.D.chestR];
  c1.D = buildDirectKit(b, [HX, 7, HZ + 20], 'c1D', [4], 'down');

  // ---- diamond pairs A, B, C: stash (double chest) + block crafter above it + two gear crafters south of it; modules of pair D too ----
  PAIRS.forEach((pr, i) => {
    if (pr.id !== 'D') {
      const x0 = i * PITCH;
      feed[pr.id] = buildFeedPair(b, [x0, 1, 0], `p${pr.id}`);
      stash[pr.id] = [feed[pr.id].chestL, feed[pr.id].chestR];
      c1[pr.id] = buildDirectKit(b, [x0, 3, 0], `c1${pr.id}`, [4], 'down');
    }
    const mx = i * PITCH;
    mod[pr.y] = buildCrafterMod(b, [mx - 12, 0, 22], pr.y, KITS[pr.y]);
    mod[pr.x] = buildCrafterMod(b, [mx + 12, 0, 22], pr.x, KITS[pr.x]);
  });
  // ---- stick side: SD stash (sticks for pickaxe + axe) ----
  const fpSD = buildFeedPair(b, [0, 1, 50], 'sD');
  const c3D = buildCrafterMod(b, [0, 3, 50], 'c3D', { enabled: [1, 4], diamonds: 2, sticks: 0 }, 'down');
  // conveyors: inner (short, near the modules) lines first, the long ones from the hub afterwards
  for (const pr of PAIRS) { if (pr.id === 'D') continue; cv(feed[pr.id].outY, mod[pr.y].inD, `cv${pr.y}`); cv(feed[pr.id].outX, mod[pr.x].inD, `cv${pr.x}`); }
  cv(fpSD.outY, mod.diamond_pickaxe.inS!, 'cvsPick');
  cv(fpSD.outX, mod.diamond_axe.inS!, 'cvsAxe');
  cv(fpP.outY, c3D.inD, 'cvpD');
  cv(fpP.outX, c3AB.inD, 'cvpAB');
  cv(fpSAB.outY, mod.diamond_shovel.inS!, 'cvsShovel');
  cv(fpSAB.outX, mod.diamond_sword.inS!, 'cvsSword');
  cv(feed.D.outY, mod.diamond_pickaxe.inD, `cv${PAIRS[0].y}`);
  cv(feed.D.outX, mod.diamond_axe.inD, `cv${PAIRS[0].x}`);

  // ---- output collector: the 8 crafter outputs run west along z=23 into the output chest in the hub ----
  const outs = PAIRS.flatMap((pr) => [mod[pr.y].out, mod[pr.x].out]).sort((p, q) => q[0] - p[0]);
  for (let i = 0; i + 1 < outs.length; i++) cv(outs[i], outs[i + 1], `cvo${i}`);
  const outChest: Pos = [HX + 8, -2, HZ + 10];
  b.raw(outChest, 'chest', { facing: 'south', type: 'single' }, 'piston', '__s');
  cv(outs[outs.length - 1], outChest, 'cvoEnd');

  // ---- block metered port (user's double chest of diamond blocks) -> line -> the four block crafters ----
  const busCells = PAIRS.map((pr) => c1[pr.id].busA);
  // the trunk hoppers sit directly above each block crafter's tap hopper: the (idle) tap sucks the first block that arrives, the
  // locked tap leaves the next ones to flow on. The last cell faces a plain block, so it never pushes into its tap.
  busCells.forEach((c, i) => b.raw(c, 'hopper', { facing: i === busCells.length - 1 ? 'east' : 'down' }, 'piston', '__s'));
  cv(fpB.outY, busCells[0], 'cvb0');
  for (let i = 1; i < busCells.length; i++) cv(busCells[i - 1], busCells[i], `cvb${i}`);
  b.raw(c2.busA, 'chest', { facing: 'south', type: 'single' }, 'piston', '__s');
  const logChest = c2.busA;                                                           // the log chest sits on the C2 tap bus cell

  // ---- timelines ----
  const tl = (name: string, o: Pos, d: number, s: number, delayRt: number, gap = 0) => {
    const t = buildTimeline(b, o, name, d, s, gap);
    timelines.push({ name, start: t.start, delayRt, PD: t.PD, PS: t.PS, PC: t.PC });
    return t;
  };
  let tz = -40;
  const nextO = (): Pos => { tz += 0; return [-90, 0, tz += 0]; };
  void nextO;
  // placement of timelines: a column west of everything, one per slot
  let slot = 0;
  const place = (): Pos => [-20 + 8 * slot++, 0, 100];
  const tDM = tl('tDM', place(), 4, 0, 0);
  const tC2 = tl('tC2', place(), 1, 0, 0);
  link(tDM.PD!, fpB.pulseY, 'tDM.tl.PD', ['bk.py']);
  link(tC2.PD!, c2.PD, 'tC2.tl.PD', ['c2.pd']); link(tC2.PC, c2.PC, 'tC2.tl.PC', ['c2.pc']);
  const gapFor = (...nets: string[]) => Math.max(0, Math.ceil((Math.max(...nets.map((n) => hops[n] ?? 0)) * HOP_GT + 60) / (SLOT_RT * 2)) - 1);
  const tP_AB = tl('tP_AB', place(), 2, 0, 50, gapFor('cvpAB'));
  link(tP_AB.PD!, fpP.pulseX, 'tP_AB.tl.PD', ['pl.px']); link(tP_AB.PC, c3AB.pulseC, 'tP_AB.tl.PC', ['c3AB.pc']);
  const tP_D = tl('tP_D', place(), 2, 0, 50, gapFor('cvpD'));
  link(tP_D.PD!, fpP.pulseY, 'tP_D.tl.PD', ['pl.py']); link(tP_D.PC, c3D.pulseC, 'tP_D.tl.PC', ['c3D.pc']);
  PAIRS.forEach((pr) => {
    const t = tl(`tc1${pr.id}`, place(), 1, 0, 125);
    link(t.PD!, c1[pr.id].PD, `tc1${pr.id}.tl.PD`, [`c1${pr.id}.pd`]); link(t.PC, c1[pr.id].PC, `tc1${pr.id}.tl.PC`, [`c1${pr.id}.pc`]);
  });
  const stickPort: Record<string, { pin: Pos; own: string }> = {
    diamond_shovel: { pin: fpSAB.pulseY, own: 'sAB.py' }, diamond_sword: { pin: fpSAB.pulseX, own: 'sAB.px' },
    diamond_pickaxe: { pin: fpSD.pulseY, own: 'sD.py' }, diamond_axe: { pin: fpSD.pulseX, own: 'sD.px' },
  };
  PAIRS.forEach((pr) => {
    for (const [role, name] of [['Y', pr.y], ['X', pr.x]] as const) {
      const k = KITS[name];
      const stickNet: Record<string, string> = { diamond_shovel: 'cvsShovel', diamond_sword: 'cvsSword', diamond_pickaxe: 'cvsPick', diamond_axe: 'cvsAxe' };
      const t = tl(`t_${name}`, place(), k.diamonds, k.sticks, 250, gapFor(`cv${name}`, ...(k.sticks > 0 ? [stickNet[name]] : [])));
      const dPin = role === 'Y' ? feed[pr.id].pulseY : feed[pr.id].pulseX;
      link(t.PD!, dPin, `t_${name}.tl.PD`, [`p${pr.id}.${role === 'Y' ? 'py' : 'px'}`]);
      if (k.sticks > 0) link(t.PS!, stickPort[name].pin, `t_${name}.tl.PS`, [stickPort[name].own]);
      link(t.PC, mod[name].pulseC, `t_${name}.tl.PC`, [`${name}.pc`]);
    }
  });
  // ---- START: button -> bus (z=ZB) -> per-group delay snake -> local trunk (z=96) -> taps down to the timeline start pins ----
  // group delays (rt) from the hopper conveyor latencies: blocks must reach all four block crafters before the c1 pulses; the planks
  // pulses follow the plank crafter; the unit pulses follow the c1 crafts and the stick crafts.
  const hopsBlocks = ['cvb0', 'cvb1', 'cvb2', 'cvb3'].reduce((a, n) => a + (hops[n] ?? 0), 0);
  const tC1 = Math.ceil((hopsBlocks * HOP_GT + 3 * 20 + 80) / 2);
  const tPl = 40;
  const tUnits = Math.max(tC1, tPl + 200) + 120;
  for (const t of timelines) t.delayRt = t.name.startsWith('tP_') ? tPl : t.name.startsWith('tc1') ? tC1 : t.name.startsWith('t_') ? tUnits : 0;
  console.log('start delays rt: c1', tC1, 'units', tUnits, 'hops blocks', hopsBlocks);
  const Y = 6, ZB = 80, ZT = 92;
  const GROUPS = [
    { slots: [0, 1], rt: 0, sx: -24, L: 0 }, { slots: [2, 3], rt: tPl, sx: -12, L: 40 },
    { slots: [4, 5, 6, 7], rt: tC1, sx: 10, L: 90 }, { slots: [8, 9, 10, 11, 12, 13, 14, 15], rt: tUnits, sx: 100, L: 120 },
  ];
  const slotX = (k: number) => -20 + 8 * k;
  const ST = 'start';
  b.floorColor = 'red';
  const BX0 = -26, BX1 = 100;
  // the button sits in the hub next to the output chest; a long boosted dust lane carries its signal to the start of the bus
  const btnWool: Pos = [HX + 8, 9, HZ + 2];
  b.wool(btnWool, 'red');
  const button: Pos = [HX + 8, 10, HZ + 2];
  b.raw(button, 'stone_button', { face: 'floor', facing: 'east' }, 'lever');
  b.dust([HX + 9, 9, HZ + 2], 'startbtn', 'red');
  const nearBranch = (x: number) => GROUPS.some((g) => Math.abs(g.sx - x) <= 1);
  for (let x = BX0; x <= BX1; x++) {
    if ((x - BX0) % 8 === 6 && !nearBranch(x)) b.rep([x, Y, ZB], 'east', 1, ST); else b.dust([x, Y, ZB], ST);
  }
  const taps: { k: number; cell: Pos }[] = [];
  for (const g of GROUPS) {
    let ex = g.sx, ez = ZB;
    if (g.rt === 0) {
      for (let z = ZB + 1; z < ZT; z++) { if ((z - ZB) % 5 === 3) b.rep([g.sx, Y, z], 'south', 1, ST); else b.dust([g.sx, Y, z], ST); }
      ez = ZT - 1;
    } else {
      b.dust([g.sx, Y, ZB + 1], ST); b.dust([g.sx, Y, ZB + 2], ST);
      const n = Math.ceil(g.rt / 4);
      const delays = Array.from({ length: n }, (_, i) => (i < n - 1 ? 4 : g.rt - 4 * (n - 1)));
      let di = 0; let z = ZB + 2; let dirE = true; let x = g.sx;
      let rows = Math.ceil(n / g.L); if (rows % 2 === 1 && rows > 1) rows++;           // even number of rows: the snake ends next to where it started
      const L = Math.ceil(n / rows);
      for (let r = 0; r < rows; r++) {
        const cnt = Math.min(L, n - r * L);
        for (let i = 0; i < cnt; i++) { const cx = dirE ? x + 1 + i : x - 1 - i; b.rep([cx, Y, z], dirE ? 'east' : 'west', delays[di++], ST); }
        const lastX = dirE ? x + cnt : x - cnt;
        const outX = dirE ? lastX + 1 : lastX - 1;
        b.dust([outX, Y, z], ST);
        if (r < rows - 1) { b.dust([outX, Y, z + 1], ST); b.dust([outX, Y, z + 2], ST); z += 2; x = outX; dirE = !dirE; ex = outX; ez = z; }
        else { ex = outX; ez = z; }
      }
      for (let zz = ez + 1; zz < ZT; zz++) { if ((zz - ez) % 5 === 3) b.rep([ex, Y, zz], 'south', 1, ST); else b.dust([ex, Y, zz], ST); }
      ez = ZT - 1;
    }
    // local trunk
    const xs = g.slots.map(slotX);
    const lo = Math.min(...xs, ex) - 1, hi = Math.max(...xs, ex) + 1;
    const east = ex <= Math.min(...xs) + 1;                       // join at the west end: flow east
    for (let tx = lo; tx <= hi; tx++) {
      if (tx === ex) { b.dust([tx, Y, ZT], ST); continue; }
      // a repeater right before every tap restores full strength for the long staircase down to the timeline start pin
      const preTap = xs.some((q) => q !== ex && tx === (q > ex ? q - 1 : q + 1));
      const flowRep = tx !== ex && (preTap || (((tx % 8) + 8) % 8 === 0 && Math.abs(tx - ex) >= 2));
      if (flowRep) b.rep([tx, Y, ZT], tx > ex ? 'east' : 'west', 1, ST); else b.dust([tx, Y, ZT], ST);
    }
    void east;
    for (const k of g.slots) taps.push({ k, cell: [slotX(k), Y, ZT] });
  }
  const startJobs = taps.map((t) => () => { b.floorColor = 'red'; links.push({ path: route(b, t.cell, timelines[t.k].start, ST, { own: [`${timelines[t.k].name}.tl.in`], strict: true }), net: ST }); });
  jobs.unshift(...startJobs);
  jobs.unshift(() => { b.floorColor = 'red'; const path = route(b, [HX + 9, 9, HZ + 2], [BX0, Y, ZB], 'startbtn', { own: [ST], strict: true }); assignRepeaters(b, path, 'startbtn', undefined, 8); });
  for (const j of jobs) j();
  for (const l of links) if (l.net !== ST) assignRepeaters(b, l.path, l.net, undefined, 5);

  // landmark pillars next to the chests the user touches: diamonds = lapis, logs = gold, output = iron, button = emerald, both leftover chests = coal
  const pillar = (near: Pos, type: string) => {
    for (let r = 3; r < 40; r++) for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      const x = near[0] + dx, z = near[2] + dz;
      let ok = true; for (let py = 0; py <= 16; py++) if (!b.isFree([x, py, z]) || !b.isFree([x + 1, py, z]) || !b.isFree([x - 1, py, z]) || !b.isFree([x, py, z + 1]) || !b.isFree([x, py, z - 1])) { ok = false; break; }
      if (ok) { for (let py = 0; py <= 16; py++) b.raw([x, py, z], type, {}, 'other'); return [x, z]; }
    }
    throw new Error('no room for the ' + type + ' pillar');
  };
  const pillars = { diamonds: pillar(fpB.chestL, 'lapis_block'), logs: pillar(logChest, 'gold_block'), output: pillar(outChest, 'iron_block'), button: pillar(button, 'emerald_block'), leftoverDiamonds: pillar(stash.D[0], 'coal_block'), leftoverSticks: pillar(fpSAB.chestL, 'coal_block') };
  console.log('pillars (x,z):', JSON.stringify(pillars));
  // signs on small wool posts next to every chest and the button: the sign faces the chest, with the direction to it
  const label = (at: Pos, lines: string[]) => {
    const DIRS: [string, number, number][] = [['east', 1, 0], ['west', -1, 0], ['south', 0, 1], ['north', 0, -1]];
    for (let r = 2; r <= 5; r++) for (const [name, dx, dz] of DIRS) {
      // post at distance r on side (dx,dz); the sign sits one cell closer to the chest and faces the chest... facing = direction the text faces
      const w: Pos = [at[0] + dx * r, at[1], at[2] + dz * r];                  // support block (wool)
      const sg: Pos = [at[0] + dx * (r - 1), at[1], at[2] + dz * (r - 1)];     // sign cell, between post and chest
      if (![w, [w[0], w[1] - 1, w[2]], sg].every((c) => b.isFree(c as Pos))) continue;
      const faceChest = name === 'east' ? 'west' : name === 'west' ? 'east' : name === 'south' ? 'north' : 'south';
      b.wool(w, 'white');
      b.raw(sg, 'oak_wall_sign', { facing: faceChest, text: lines }, 'other');
      return;
    }
    console.log('no room for sign', lines[0]);
  };
  label(fpB.chestL, ['DIAMOND BLOCKS', 'in here', '(left half)', 'put 64 max']);
  label(logChest, ['OAK LOGS', 'in here']);
  label(button, ['PRESS BUTTON', 'then wait', '2 minutes']);
  label(outChest, ['OUTPUT', 'full set comes', 'out here']);
  label(stash.D[1], ['LEFTOVER', 'DIAMONDS', '(3 per press)']);
  label(fpSAB.chestR, ['LEFTOVER', 'STICKS', '(1 per press)']);
  return {
    b, button, blockChest: [fpB.chestL, fpB.chestR], logChest,
    leftoverDiamonds: stash.D, leftoverSticks: [fpSAB.chestL, fpSAB.chestR], planksStash: fpP.chestL, pins,
    outputs: [outChest], timelines,
  };
}

if (process.argv[1]?.endsWith('gear-set.ts')) {
  const w = new World();
  try {
    const m = buildGearSet(w); console.log('built', w.listBlocks().length, 'blocks;', m.timelines.length, 'timelines');
    if (process.argv.includes('--export')) {
      w.setItem(m.blockChest[0], 0, { id: 'diamond_block', count: 64 }); w.setItem(m.logChest, 0, { id: 'oak_log', count: 16 });
      writeFileSync('examples/diamond-gear-set.schem', exportSchem(w).buffer); console.log('wrote examples/diamond-gear-set.schem'); }
  } catch (e: any) { console.log('FAIL', e.message); }
}

/**
 * Building takes minutes (the router), so the finished world is cached in .cache/gear-set.json and reloaded in seconds. The cache key is a
 * hash of the generator sources. Used by the diagnostics and run scripts.
 */
export function loadGearSet(w: World): Machine {
  const files = ['gear-set.ts', 'gear-parts.ts', 'gear-kit.ts', 'noglue-lib.ts', '../src/designs.ts'].map((f) => new URL(f, import.meta.url));
  const key = createHash('sha1').update(files.map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')).join('\n')).digest('hex');
  const path = new URL('../.cache/gear-set.json', import.meta.url);
  if (existsSync(path)) {
    const c = JSON.parse(readFileSync(path, 'utf8'));
    if (c.key === key || process.env.GEAR_CACHE_ANY) {
      for (const b of c.blocks) w.setRaw(b.pos, b.type, b.props);
      for (const [pos, off] of c.disabled as [Pos, number[]][]) for (const i of off) w.setSlotDisabled(pos, i, true);
      for (const [pos, inv] of c.items as [Pos, ({ id: string; count: number } | null)[]][]) inv.forEach((it, i) => { if (it) w.setItem(pos, i, it); });
      w.run(40);
      const occ = new Map<string, any>(c.occ);
      return { ...c.machine, b: { occ } as any };
    }
  }
  const m = buildGearSet(w);
  const blocks = w.listBlocks().filter((b) => b.type !== 'moving_piston');
  const disabled = blocks.filter((b) => b.type === 'crafter').map((b) => [b.pos, w.disabledSlots(b.pos)] as [Pos, number[]]);
  const items = blocks.filter((b) => ['chest', 'hopper', 'dropper', 'crafter'].includes(b.type)).flatMap((b) => { const inv = w.items(b.pos); return inv && inv.some(Boolean) && !(b.type === 'chest' && b.props?.type === 'right') ? [[b.pos, inv] as [Pos, any]] : []; });
  const { b: _b, ...machine } = m;
  const occ = [...(m.b as any).occ.entries()].filter(([, t]: any) => t.net).map(([k, t]: any) => [k, { kind: t.kind, net: t.net }]);
  mkdirSync(new URL('../.cache/', import.meta.url), { recursive: true });
  writeFileSync(path, JSON.stringify({ key, blocks, disabled, items, occ, machine }));
  return m;
}
