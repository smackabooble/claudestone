/**
 * Diamond gear set machine (sim only). Run: npx tsx examples/gear-set.ts
 * Diamond blocks + oak logs -> diamond helmet, chestplate, leggings, boots, sword, pickaxe, axe, shovel.
 * Numbers: 33 diamonds (4 blocks = 36, 3 spare) and 7 sticks (1 log = 8 sticks, 1 spare).
 *
 * Every crafter is fed by droppers that hold exactly one item (comparator-locked taps), so a pulse timeline decides how many
 * items each crafter gets. Shared stashes are double chests with two such ports. The leftover is what stays in the stashes.
 * Hoppers can hold a couple of stray items per port, so the first presses after building "prime" the machine.
 */
import { World } from '../src/world.ts';
import { Board, route, assignRepeaters, conveyor } from './noglue-lib.ts';
import { buildFeedPair, buildCrafterMod, buildDirectKit } from './gear-parts.ts';
import { buildTimeline, KITS, SLOT_RT } from './gear-kit.ts';
import type { Pos } from '../src/dirs.ts';

const PITCH = 48;
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
  outputs: Pos[];            // collector hoppers of the 8 gear crafters (facing east)
  timelines: { name: string; start: Pos; delayRt: number; PD: Pos | null; PS: Pos | null; PC: Pos }[];
}

export function buildGearSet(w: World): Machine {
  const b = new Board(w);
  const links: { path: Pos[]; net: string }[] = [];
  const jobs: (() => void)[] = [];
  const link = (from: Pos, to: Pos, net: string, own: string[]) => {
    jobs.push(() => { b.floorColor = 'orange'; links.push({ path: route(b, from, to, net, { own, strict: true }), net }); });
  };
  const timelines: Machine['timelines'] = [];
  const later: (() => void)[] = [];
  const hops: Record<string, number> = {};
  const cv = (from: Pos, to: Pos, net: string) => { hops[net] = conveyor(b, from, to, net).length; };
  const HOP_GT = 8;
  const mod: Record<string, ReturnType<typeof buildCrafterMod>> = {};
  const stash: Record<string, Pos[]> = {};

  // ---- diamond pairs: stash (double chest) + block crafter above it + two gear crafters south of it ----
  const feed: Record<string, ReturnType<typeof buildFeedPair>> = {};
  const c1: Record<string, ReturnType<typeof buildDirectKit>> = {};
  PAIRS.forEach((pr, i) => {
    const x0 = i * PITCH;
    feed[pr.id] = buildFeedPair(b, [x0, 1, 0], `p${pr.id}`);
    stash[pr.id] = [feed[pr.id].chestL, feed[pr.id].chestR];
    c1[pr.id] = buildDirectKit(b, [x0, 3, 0], `c1${pr.id}`, [4], 'down');
    mod[pr.y] = buildCrafterMod(b, [x0 - 12, 0, 22], pr.y, KITS[pr.y]);
    mod[pr.x] = buildCrafterMod(b, [x0 + 12, 0, 22], pr.x, KITS[pr.x]);
    cv(feed[pr.id].outY, mod[pr.y].inD, `cv${pr.y}`);
    cv(feed[pr.id].outX, mod[pr.x].inD, `cv${pr.x}`);
  });

  // ---- stick side: planks stash (C2 above), two stick stashes (C3 above) ----
  const fpP = buildFeedPair(b, [20, 4, 70], 'pl');                                   // planks stash + 2 ports (outputs at y=4)
  const c2 = buildDirectKit(b, [20, 6, 70], 'c2', [4], 'down');                     // log -> 4 planks, facing down into the stash
  const fpSD = buildFeedPair(b, [0, 1, 50], 'sD');                                   // sticks for pickaxe + axe
  const c3D = buildCrafterMod(b, [0, 3, 50], 'c3D', { enabled: [1, 4], diamonds: 2, sticks: 0 }, 'down');
  const fpSAB = buildFeedPair(b, [PITCH + 6, 1, 50], 'sAB');                         // sticks for shovel + sword
  const c3AB = buildCrafterMod(b, [PITCH + 6, 3, 50], 'c3AB', { enabled: [1, 4], diamonds: 2, sticks: 0 }, 'down');
  cv(fpP.outY, c3D.inD, 'cvpD');
  cv(fpP.outX, c3AB.inD, 'cvpAB');
  cv(fpSAB.outY, mod.diamond_shovel.inS!, 'cvsShovel');
  cv(fpSAB.outX, mod.diamond_sword.inS!, 'cvsSword');
  cv(fpSD.outY, mod.diamond_pickaxe.inS!, 'cvsPick');
  cv(fpSD.outX, mod.diamond_axe.inS!, 'cvsAxe');

  // ---- output collector: the 8 crafter outputs chain east along z=23 into one chest ----
  const outs = PAIRS.flatMap((pr) => [mod[pr.y].out, mod[pr.x].out]).sort((p, q) => p[0] - q[0]);
  for (let i = 0; i + 1 < outs.length; i++) cv(outs[i], outs[i + 1], `cvo${i}`);
  const lastOut = outs[outs.length - 1];
  const outChest: Pos = [lastOut[0] + 1, lastOut[1], lastOut[2]];
  b.raw(outChest, 'chest', { facing: 'south', type: 'single' }, 'piston', '__s');

  // ---- block metered port (user's double chest of diamond blocks) -> line -> the four block crafters ----
  const fpB = buildFeedPair(b, [-30, 5, -6], 'bk');
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
  const gapFor = (...nets: string[]) => Math.max(0, Math.ceil((Math.max(...nets.map((n) => hops[n] ?? 0)) * HOP_GT + 24) / (SLOT_RT * 2)) - 1);
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
    { slots: [4, 5, 6, 7], rt: tC1, sx: 6, L: 56 }, { slots: [8, 9, 10, 11, 12, 13, 14, 15], rt: tUnits, sx: 70, L: 100 },
  ];
  const slotX = (k: number) => -20 + 8 * k;
  const ST = 'start';
  b.floorColor = 'red';
  const BX0 = -26, BX1 = 70;
  b.wool([BX0 - 1, Y, ZB], 'red');
  b.raw([BX0 - 1, Y + 1, ZB], 'stone_button', { face: 'floor', facing: 'east' }, 'lever');
  const nearBranch = (x: number) => GROUPS.some((g) => Math.abs(g.sx - x) <= 1);
  for (let x = BX0; x <= BX1; x++) {
    if ((x - BX0) % 8 === 6 && !nearBranch(x)) b.rep([x, Y, ZB], 'east', 1, ST); else b.dust([x, Y, ZB], ST);
  }
  const taps: { k: number; cell: Pos }[] = [];
  for (const g of GROUPS) {
    let ex = g.sx, ez: number;
    if (g.rt === 0) {
      for (let z = ZB + 1; z < ZT; z++) { if ((z - ZB) % 5 === 3) b.rep([g.sx, Y, z], 'south', 1, ST); else b.dust([g.sx, Y, z], ST); }
      ez = ZT - 1;
    } else {
      b.dust([g.sx, Y, ZB + 1], ST); b.dust([g.sx, Y, ZB + 2], ST);
      const n = Math.ceil(g.rt / 4);
      const delays = Array.from({ length: n }, (_, i) => (i < n - 1 ? 4 : g.rt - 4 * (n - 1)));
      let di = 0; let z = ZB + 2; let dirE = true; let x = g.sx;
      const rows = Math.ceil(n / g.L);
      for (let r = 0; r < rows; r++) {
        const cnt = Math.min(g.L, n - r * g.L);
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
      const flowRep = ((tx % 8) + 8) % 8 === 0 && Math.abs(tx - ex) >= 2;                  // taps sit at x = 4 (mod 8): boosters midway between them
      if (flowRep) b.rep([tx, Y, ZT], tx > ex ? 'east' : 'west', 1, ST); else b.dust([tx, Y, ZT], ST);
    }
    void east;
    for (const k of g.slots) taps.push({ k, cell: [slotX(k), Y, ZT] });
  }
  const startJobs = taps.map((t) => () => { b.floorColor = 'red'; links.push({ path: route(b, t.cell, timelines[t.k].start, ST, { own: [`${timelines[t.k].name}.tl.in`], strict: true }), net: ST }); });
  jobs.unshift(...startJobs);
  for (const j of jobs) j();
  for (const l of links) if (l.net !== ST) assignRepeaters(b, l.path, l.net, undefined, 5);

  return {
    b, button: [BX0 - 1, Y + 1, ZB] as Pos, blockChest: [fpB.chestL, fpB.chestR], logChest,
    leftoverDiamonds: stash.D, leftoverSticks: [fpSAB.chestL, fpSAB.chestR],
    outputs: [outChest], timelines,
  };
}

if (process.argv[1]?.endsWith('gear-set.ts')) {
  const w = new World();
  try { const m = buildGearSet(w); console.log('built', w.listBlocks().length, 'blocks;', m.timelines.length, 'timelines'); } catch (e: any) { console.log('FAIL', e.message); }
}
