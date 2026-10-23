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
import { buildLift, liftFree, type Lift } from './gear-lift.ts';
import type { Pos } from '../src/dirs.ts';

const PITCH = 48;
/** vertical stack: pairs A, B, C (stash + block crafter + their two gear crafters) sit above each other in one column; pair D's gear crafters are at the bottom */
const PX = 0;
const LY: Record<string, number> = { A: 0, B: -8, C: -16, D: -24 };
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
  leftover: Pos[];           // the ONE double chest that collects the spare diamonds and the spare stick (left half first)
  planksStash: Pos;
  pins: { net: string; pin: Pos }[];   // destination pin of every pulse lane (diagnostics)
  lifts: Lift[];
  platform: { diamonds: Pos[]; logs: Pos[]; output: Pos[]; leftover: Pos[]; button: Pos };
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
  // splitters: a block crafter / stick crafter fills a small feed pair; one port hands the needed items on, the other the spare ones to the leftover chest
  const fpS0D = buildFeedPair(b, [HX, 5, HZ + 20], 'x0');                                 // tier B: 9 diamonds from block crafter D -> 6 to pair D, 3 spare
  c1.D = buildDirectKit(b, [HX, 7, HZ + 20], 'c1D', [4], 'down');
  feed.D = buildFeedPair(b, [HX, 1, HZ + 36], 'pD');                                      // pair D stash: pickaxe + axe (exactly 6 diamonds, nothing left over)
  stash.D = [feed.D.chestL, feed.D.chestR];
  const fpS0S = buildFeedPair(b, [HX + 16, 5, HZ + 20], 'x1');                            // tier B: 4 sticks from the stick crafter -> 3 to the stick stash, 1 spare
  const c3AB = buildCrafterMod(b, [HX + 16, 7, HZ + 20], 'c3AB', { enabled: [1, 4], diamonds: 2, sticks: 0 }, 'down');
  const fpSAB = buildFeedPair(b, [HX + 16, 1, HZ + 36], 'sAB');                           // stick stash: shovel + sword (exactly 3 sticks)
  const lbL: Pos = [HX + 8, 0, HZ + 28], lbR: Pos = [HX + 9, 0, HZ + 28];                  // the leftover double chest
  b.raw(lbL, 'chest', { facing: 'north', type: 'left' }, 'piston', '__s');
  b.raw(lbR, 'chest', { facing: 'north', type: 'right' }, 'piston', '__s');

  // ---- diamond pairs A, B, C: stash (double chest) + block crafter above it + two gear crafters south of it; modules of pair D too ----
  PAIRS.forEach((pr) => {
    const ly = LY[pr.id];
    if (pr.id !== 'D') {
      feed[pr.id] = buildFeedPair(b, [PX, 1 + ly, 0], `p${pr.id}`);
      stash[pr.id] = [feed[pr.id].chestL, feed[pr.id].chestR];
      c1[pr.id] = buildDirectKit(b, [PX, 3 + ly, 0], `c1${pr.id}`, [4], 'down');
    }
    mod[pr.y] = buildCrafterMod(b, [PX - 12, ly, 22], pr.y, KITS[pr.y]);
    mod[pr.x] = buildCrafterMod(b, [PX + 12, ly, 22], pr.x, KITS[pr.x]);
  });
  // ---- stick side: SD stash (sticks for pickaxe + axe) ----
  const fpSD = buildFeedPair(b, [PX, LY.D + 2, 50], 'sD');
  const c3D = buildCrafterMod(b, [PX, LY.D + 4, 50], 'c3D', { enabled: [1, 4], diamonds: 2, sticks: 0 }, 'down');
  // conveyors: inner (short, near the modules) lines first, the long ones from the hub afterwards
  for (const pr of PAIRS) { if (pr.id === 'D') continue; cv(feed[pr.id].outY, mod[pr.y].inD, `cv${pr.y}`); cv(feed[pr.id].outX, mod[pr.x].inD, `cv${pr.x}`); }
  cv(fpSD.outY, mod.diamond_pickaxe.inS!, 'cvsPick');
  cv(fpSD.outX, mod.diamond_axe.inS!, 'cvsAxe');
  cv(fpP.outY, c3D.inD, 'cvpD');
  cv(fpP.outX, c3AB.inD, 'cvpAB');
  cv(fpSAB.outY, mod.diamond_shovel.inS!, 'cvsShovel');
  cv(fpSAB.outX, mod.diamond_sword.inS!, 'cvsSword');
  cv(fpS0D.outY, feed.D.chestL, 'cvS0Dy'); cv(fpS0D.outX, lbL, 'cvS0Dx');
  cv(fpS0S.outY, fpSAB.chestL, 'cvS0Sy'); cv(fpS0S.outX, lbL, 'cvS0Sx');
  cv(feed.D.outY, mod.diamond_pickaxe.inD, `cv${PAIRS[0].y}`);
  cv(feed.D.outX, mod.diamond_axe.inD, `cv${PAIRS[0].x}`);

  // ---- output collector: every layer's two crafter outputs run to the shaft at x=PX, z=23; the shaft (hoppers facing down) ends in the output chest ----
  const shaftTop = LY.A - 2, shaftBottom = LY.D - 2;
  const shaft = (y: number): Pos => [PX, y, 23];
  for (let y = shaftTop; y >= shaftBottom; y--) b.raw(shaft(y), 'hopper', { facing: 'down' }, 'piston', '__s');
  const outChest: Pos = [PX, shaftBottom - 1, 23];
  b.raw(outChest, 'chest', { facing: 'south', type: 'single' }, 'piston', '__s');
  for (const pr of PAIRS) { cv(mod[pr.y].out, shaft(LY[pr.id] - 2), `cvo_${pr.y}`); cv(mod[pr.x].out, shaft(LY[pr.id] - 2), `cvo_${pr.x}`); }

  // ---- block metered port (user's double chest of diamond blocks) -> line -> the four block crafters ----
  const busCells = PAIRS.map((pr) => c1[pr.id].busA);
  // the trunk hoppers sit directly above each block crafter's tap hopper: the (idle) tap sucks the first block that arrives, the
  // locked tap leaves the next ones to flow on. The last cell faces a plain block, so it never pushes into its tap.
  busCells.forEach((c, i) => b.raw(c, 'hopper', { facing: i === busCells.length - 1 ? 'east' : 'down' }, 'piston', '__s'));
  cv(fpB.outY, busCells[0], 'cvb0');
  for (let i = 1; i < busCells.length; i++) cv(busCells[i - 1], busCells[i], `cvb${i}`);
  b.raw(c2.busA, 'chest', { facing: 'south', type: 'single' }, 'piston', '__s');
  const logChest = c2.busA;                                                           // the log chest sits on the C2 tap bus cell

  // ---- platform: one deck with every chest the user touches, in the layout of knowledge/refs/diamond-maker-example.litematic ----
  // START block + button at the left, then four double chests in a row (DIAMONDS, LOGS, OUTPUT, LEFTOVER); a hopper under each half of the two input chests,
  // a sign on the front of each. Input chests drain straight down (or along a hopper line) into the hub chests.
  const PY = 11, CY = PY + 1;                                                          // deck / hopper level, chest level
  const CX = (i: number) => HX + 3 * i, ROWZ = HZ;
  const sign = (at: Pos, facing: string, lines: string[]) => b.raw(at, 'oak_wall_sign', { facing, text: lines }, 'other');
  const dchest = (i: number) => {
    b.raw([CX(i), CY, ROWZ], 'chest', { facing: 'north', type: 'left' }, 'piston', '__s');
    b.raw([CX(i) + 1, CY, ROWZ], 'chest', { facing: 'north', type: 'right' }, 'piston', '__s');
    return [[CX(i), CY, ROWZ], [CX(i) + 1, CY, ROWZ]] as Pos[];
  };
  const diamondsChest = dchest(0), logsChest = dchest(1), outputChest = dchest(2), leftoverChest = dchest(3);
  for (const i of [0, 1]) for (const dx of [0, 1]) b.raw([CX(i) + dx, PY, ROWZ], 'hopper', { facing: 'down' }, 'piston', '__s');
  // DIAMONDS sits right above the hub block chest; LOGS sends its items along a hopper line to the log chest
  b.raw([CX(1), PY - 1, ROWZ], 'hopper', { facing: 'east' }, 'piston', '__s');
  b.raw([CX(1) + 1, PY - 1, ROWZ], 'hopper', { facing: 'west' }, 'piston', '__s');
  hops.cvLogs = conveyor(b, [CX(1), PY - 1, ROWZ], logChest, 'cvLogs').length;
  const startBlock: Pos = [HX - 3, CY, ROWZ];
  b.wool(startBlock, 'brown');
  const button: Pos = [HX - 3, CY, ROWZ - 1];
  b.raw(button, 'stone_button', { face: 'wall', facing: 'north' }, 'lever');
  const btnDust: Pos = [HX - 4, CY, ROWZ];                                            // powered by the START block, start of the lane to the timelines
  b.floorColor = 'red';
  for (let x = HX - 6; x <= CX(3) + 3; x++) for (let z = ROWZ - 2; z <= ROWZ + 1; z++) if (b.isFree([x, PY, z])) b.wool([x, PY, z], 'light_gray');
  b.dust(btnDust, 'startbtn', 'red');
  sign([CX(0), CY, ROWZ - 1], 'north', ['', 'DIAMONDS', 'blocks in here', '']);
  sign([CX(1), CY, ROWZ - 1], 'north', ['', 'OAK LOGS', 'in here', '']);
  sign([CX(2), CY, ROWZ - 1], 'north', ['', 'OUTPUT', 'full set', 'comes here']);
  sign([CX(3), CY, ROWZ - 1], 'north', ['', 'LEFTOVER', 'diamonds', 'and sticks']);
  sign([HX - 2, CY, ROWZ], 'east', ['', 'START', '(press)', '']);

  // ---- timelines ----
  const tl = (name: string, o: Pos, d: number, s: number, delayRt: number, gap = 0, gapS = 0, noPC = false) => {
    const t = buildTimeline(b, o, name, d, s, gap, gapS, noPC);
    timelines.push({ name, start: t.start, delayRt, PD: t.PD, PS: t.PS, PC: t.PC });
    return t;
  };
  let tz = -40;
  const nextO = (): Pos => { tz += 0; return [-90, 0, tz += 0]; };
  void nextO;
  // placement of timelines: a column west of everything, one per slot
  const TZ0 = 112;                                                    // timelines start here (the START field with its snake rows lies in front of them)
  let slot = 0;
  const place = (): Pos => [-20 + 8 * slot++, 0, TZ0];
  const tDM = tl('tDM', place(), 4, 0, 0);
  const tC2 = tl('tC2', place(), 1, 0, 0);
  link(tDM.PD!, fpB.pulseY, 'tDM.tl.PD', ['bk.py']);
  link(tC2.PD!, c2.PD, 'tC2.tl.PD', ['c2.pd']); link(tC2.PC, c2.PC, 'tC2.tl.PC', ['c2.pc']);
  const gapFor = (...nets: string[]) => Math.max(0, Math.ceil((Math.max(...nets.map((n) => hops[n] ?? 0)) * HOP_GT + 60) / (SLOT_RT * 2)) - 1);
  const tP_AB = tl('tP_AB', place(), 2, 0, 50, gapFor('cvpAB'));
  link(tP_AB.PD!, fpP.pulseX, 'tP_AB.tl.PD', ['pl.px']); link(tP_AB.PC, c3AB.pulseC, 'tP_AB.tl.PC', ['c3AB.pc']);
  const tP_D = tl('tP_D', place(), 2, 0, 50, gapFor('cvpD'));
  link(tP_D.PD!, fpP.pulseY, 'tP_D.tl.PD', ['pl.py']); link(tP_D.PC, c3D.pulseC, 'tP_D.tl.PC', ['c3D.pc']);
  // stick splitter (after the stick crafter c3AB): 3 sticks to the stick stash (Y port), 1 spare stick to the leftover chest (X port)
  const tS0S = tl('tS0S', place(), 3, 1, 0, 0, 0, true);
  link(tS0S.PD!, fpS0S.pulseY, 'tS0S.tl.PD', ['x1.py']); link(tS0S.PS!, fpS0S.pulseX, 'tS0S.tl.PS', ['x1.px']);
  PAIRS.forEach((pr) => {
    const t = tl(`tc1${pr.id}`, place(), 1, 0, 125);
    link(t.PD!, c1[pr.id].PD, `tc1${pr.id}.tl.PD`, [`c1${pr.id}.pd`]); link(t.PC, c1[pr.id].PC, `tc1${pr.id}.tl.PC`, [`c1${pr.id}.pc`]);
  });
  // diamond splitter (after block crafter D): 6 diamonds to pair D's stash (Y port), 3 spare diamonds to the leftover chest (X port)
  const tS0D = tl('tS0D', place(), 6, 3, 0, 0, 0, true);
  link(tS0D.PD!, fpS0D.pulseY, 'tS0D.tl.PD', ['x0.py']); link(tS0D.PS!, fpS0D.pulseX, 'tS0D.tl.PS', ['x0.px']);
  const stickPort: Record<string, { pin: Pos; own: string }> = {
    diamond_shovel: { pin: fpSAB.pulseY, own: 'sAB.py' }, diamond_sword: { pin: fpSAB.pulseX, own: 'sAB.px' },
    diamond_pickaxe: { pin: fpSD.pulseY, own: 'sD.py' }, diamond_axe: { pin: fpSD.pulseX, own: 'sD.px' },
  };
  PAIRS.forEach((pr) => {
    for (const [role, name] of [['Y', pr.y], ['X', pr.x]] as const) {
      const k = KITS[name];
      const stickNet: Record<string, string> = { diamond_shovel: 'cvsShovel', diamond_sword: 'cvsSword', diamond_pickaxe: 'cvsPick', diamond_axe: 'cvsAxe' };
      const gapS = k.sticks > 0 ? Math.max(0, Math.ceil((((hops[`cv${name}`] ?? 0) - (hops[stickNet[name]] ?? 0)) * HOP_GT + 100) / (SLOT_RT * 2)) - 1) : 0;
      const t = tl(`t_${name}`, place(), k.diamonds, k.sticks, 250, gapFor(`cv${name}`, ...(k.sticks > 0 ? [stickNet[name]] : []), ...(gapS > 0 ? [] : [])), gapS);
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
  const tSS = tPl + (gapFor('cvpAB') + 2) * SLOT_RT + 100;                         // after the stick crafter c3AB has crafted
  const tSD = tC1 + 60;                                                              // after block crafter D has crafted
  const tUnits = Math.max(Math.max(tC1, tPl + 200) + 120, tSD + 9 * SLOT_RT + Math.ceil(((hops.cvS0Dy ?? 0) * HOP_GT) / 2) + 120, tSS + 4 * SLOT_RT + Math.ceil(((hops.cvS0Sy ?? 0) * HOP_GT) / 2) + 120);
  const SC = Number(process.env.DELAY_SCALE ?? 1);                                    // experiment: shrink the safety margins of the group delays
  const delayOf = (n: string) => Math.round(SC * (n.startsWith('tP_') ? tPl : n === 'tS0S' ? tSS : n === 'tS0D' ? tSD : n.startsWith('tc1') ? tC1 : n.startsWith('t_') ? tUnits : 0));
  for (const t of timelines) t.delayRt = delayOf(t.name);
  console.log('hops', JSON.stringify(hops));
  console.log('start delays rt: c1', tC1, 'units', tUnits, 'splitters', tSS, tSD, 'hops blocks', hopsBlocks);
  const Y = 6, ZB = 80, ZT = 104;
  // one START group per delay value (timelines are placed in group order, so the slots of a group are contiguous)
  const GROUPS: { slots: number[]; rt: number; sx: number; L: number }[] = [];
  timelines.forEach((t, k) => { const g = GROUPS[GROUPS.length - 1]; if (g && g.rt === t.delayRt) g.slots.push(k); else GROUPS.push({ slots: [k], rt: t.delayRt, sx: 0, L: 0 }); });
  const snakeWidth = (rt: number) => { const n = Math.ceil(rt / 4); const Lmax = Math.max(10, Math.ceil(n / 8)); let rows = Math.ceil(n / Lmax); if (rows % 2 === 1 && rows > 1) rows++; return Math.ceil(n / rows); };
  let sxNext = -24;
  for (const g of GROUPS) { g.sx = sxNext; sxNext += g.rt === 0 ? 12 : snakeWidth(g.rt) + 8; }
  const slotX = (k: number) => -20 + 8 * k;
  const ST = 'start';
  b.floorColor = 'red';
  const BX0 = -26, BX1 = GROUPS[GROUPS.length - 1].sx;
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
      const Lmax = g.L || Math.max(10, Math.ceil(n / 8));                           // at most 8 rows: the snake is folded to a block, not stretched along x
      let rows = Math.ceil(n / Lmax); if (rows % 2 === 1 && rows > 1) rows++;           // even number of rows: the snake ends next to where it started
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
  jobs.unshift(() => { b.floorColor = 'red'; const path = route(b, btnDust, [BX0, Y, ZB], 'startbtn', { own: [ST], strict: true }); assignRepeaters(b, path, 'startbtn', undefined, 8); });
  for (const j of jobs) j();
  for (const l of links) {
    if (l.net !== ST) { assignRepeaters(b, l.path, l.net, undefined, 5); continue; }
    try { assignRepeaters(b, l.path, l.net, undefined, 4); } catch { /* too few straight cells: the staircase is short enough */ }     // START taps: a booster where the path has a straight cell
  }

  // ---- lifts: the output chest and the leftover chest stand at the bottom of the machine; a dropper + water column carries their items up ----
  // (not provable in the sim: liftShim() in gear-lift.ts stands in for the water). Each lift column stands behind the platform.
  const lifts: Lift[] = [];
  const lift = (anchor: Pos, by: number, name: string): Lift => {
    for (let r = 0; r < 80; r += 1) for (let dx = -r; dx <= r; dx++) for (const dz of (Math.abs(dx) === r ? Array.from({ length: 2 * r + 1 }, (_, i) => i - r) : [-r, r])) {
      const o: Pos = [anchor[0] + dx, by, anchor[2] + dz];
      if (liftFree(b, o, by, CY)) { const l = buildLift(b, o, by, CY, name); lifts.push(l); return l; }
    }
    throw new Error('no room for the ' + name + ' lift');
  };
  const outLift = lift([CX(2) + 2, 0, ROWZ + 8], outChest[1] - 1, 'liftOut');
  conveyor(b, [outChest[0], outChest[1] - 1, outChest[2]], outLift.dropper, 'cvLiftOutIn');
  conveyor(b, outLift.exit, outputChest[1], 'cvLiftOutTop');
  const leftLift = lift([CX(3) + 2, 0, ROWZ + 8], lbL[1] - 1, 'liftLeft');
  conveyor(b, [lbL[0], lbL[1] - 1, lbL[2]], leftLift.dropper, 'cvLiftLeftIn');
  conveyor(b, leftLift.exit, leftoverChest[1], 'cvLiftLeftTop');

  return {
    b, button, blockChest: [fpB.chestL, fpB.chestR], logChest,
    leftover: [lbL, lbR], planksStash: fpP.chestL, pins,
    outputs: [outChest], timelines,
    lifts, platform: { diamonds: diamondsChest, logs: logsChest, output: outputChest, leftover: leftoverChest, button },
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
  const key = createHash('sha1').update(files.map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')).join('\n') + (process.env.DELAY_SCALE ?? '')).digest('hex');
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
