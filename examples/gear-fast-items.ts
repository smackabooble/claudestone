/**
 * Item side of the compact ("fast") gear set: every unit (feed pair, block/stick crafter, gear crafter module) plus the hopper conveyors
 * between them, placed from a small config so a search can shrink the conveyors. No timelines, lanes, platform or lifts here.
 * Rules of thumb that fix the layout: hoppers only move sideways or down (a conveyor never rises), so every source sits above its sink.
 */
import { Board, conveyor } from './noglue-lib.ts';
import { buildFeedPair, buildCrafterMod, buildDirectKit } from './gear-parts.ts';
import { KITS } from './gear-kit.ts';
import type { Pos } from '../src/dirs.ts';
import { buildLift, liftFree, type Lift } from './gear-lift.ts';

export interface Pair { id: string; y: string; x: string }
export const PAIRS: Pair[] = [
  { id: 'D', y: 'diamond_pickaxe', x: 'diamond_axe' },       // 3 + 3 (+3 spare = leftover diamonds)
  { id: 'A', y: 'diamond_shovel', x: 'diamond_chestplate' }, // 1 + 8
  { id: 'B', y: 'diamond_sword', x: 'diamond_leggings' },    // 2 + 7
  { id: 'C', y: 'diamond_boots', x: 'diamond_helmet' },      // 4 + 5
];

/** all tunable positions (absolute x,z; y from the levels) */
export interface Cfg {
  /** level (module row) of every pair; the spine (stash + block crafter) of A/B/C sits above its level, D has the splitter tier on top of it */
  ly: Record<string, number>;
  /** module offsets from the spine: Y module west, X module east */
  modDX: number; modYz: number; modXz: number;
  /** output shaft column */
  shaft: [number, number];
  fpB: Pos;        // block chest + metered port (hub top)
  fpP: Pos;        // planks stash under the log crafter c2
  fpSD: Pos;       // stick stash for pickaxe + axe (c3D crafts into it from above)
  fpS0S: Pos;      // stick splitter (c3AB crafts into it from above)
  fpSAB: Pos;      // stick stash for shovel + sword
  leftover: Pos;   // left half of the leftover double chest
  liftOut: Pos;    // search anchor for the output lift column
  liftLeft: Pos;   // search anchor for the leftover lift column
}

export const DEFAULT_CFG: Cfg = {
  ly: { D: 8, A: 0, B: -8, C: -16 },
  modDX: 10, modYz: 3, modXz: 9,
  shaft: [5, 6],
  fpB: [-40, 15, -6],
  fpP: [-40, 13, 20],
  fpSD: [30, 10, 20],
  fpS0S: [-40, 10, 40],
  fpSAB: [-40, 7, 60],
  leftover: [-30, 0, 50],
  liftOut: [10, 0, 14],
  liftLeft: [-20, 0, 14],
};

export interface Items {
  b: Board;
  hops: Record<string, number>;
  feed: Record<string, ReturnType<typeof buildFeedPair>>;
  c1: Record<string, ReturnType<typeof buildDirectKit>>;
  mod: Record<string, ReturnType<typeof buildCrafterMod>>;
  fpB: ReturnType<typeof buildFeedPair>; fpP: ReturnType<typeof buildFeedPair>; c2: ReturnType<typeof buildDirectKit>;
  fpS0D: ReturnType<typeof buildFeedPair>; fpS0S: ReturnType<typeof buildFeedPair>; c3AB: ReturnType<typeof buildCrafterMod>;
  fpSAB: ReturnType<typeof buildFeedPair>; fpSD: ReturnType<typeof buildFeedPair>; c3D: ReturnType<typeof buildCrafterMod>;
  lbL: Pos; lbR: Pos; logChest: Pos; outLift: Lift;
}

export function buildItems(b: Board, cfg: Cfg = DEFAULT_CFG): Items {
  const hops: Record<string, number> = {};
  const cv = (from: Pos, to: Pos, net: string) => { hops[net] = conveyor(b, from, to, net).length; };
  const feed: Items['feed'] = {}, c1: Items['c1'] = {}, mod: Items['mod'] = {};
  const { ly } = cfg;

  // top hub: block metering, log crafter + planks stash
  const fpB = buildFeedPair(b, cfg.fpB, 'bk');
  const fpP = buildFeedPair(b, cfg.fpP, 'pl');
  const c2 = buildDirectKit(b, [cfg.fpP[0], cfg.fpP[1] + 2, cfg.fpP[2]], 'c2', [4], 'down');
  // spines
  const fpS0D = buildFeedPair(b, [0, ly.D + 4, 0], 'x0');                                  // splitter under block crafter D
  c1.D = buildDirectKit(b, [0, ly.D + 6, 0], 'c1D', [4], 'down');
  feed.D = buildFeedPair(b, [-2, ly.D + 1, 0], 'pD');                                       // stash D right below the splitter's Y port
  for (const pr of PAIRS) if (pr.id !== 'D') {
    feed[pr.id] = buildFeedPair(b, [0, ly[pr.id] + 1, 0], `p${pr.id}`);
    c1[pr.id] = buildDirectKit(b, [0, ly[pr.id] + 3, 0], `c1${pr.id}`, [4], 'down');
  }
  // sticks
  const c3D = buildCrafterMod(b, [cfg.fpSD[0], cfg.fpSD[1] + 2, cfg.fpSD[2]], 'c3D', { enabled: [1, 4], diamonds: 2, sticks: 0 }, 'down');
  const fpSD = buildFeedPair(b, cfg.fpSD, 'sD');
  const c3AB = buildCrafterMod(b, [cfg.fpS0S[0], cfg.fpS0S[1] + 2, cfg.fpS0S[2]], 'c3AB', { enabled: [1, 4], diamonds: 2, sticks: 0 }, 'down');
  const fpS0S = buildFeedPair(b, cfg.fpS0S, 'x1');
  const fpSAB = buildFeedPair(b, cfg.fpSAB, 'sAB');
  const lbL = cfg.leftover, lbR: Pos = [lbL[0] + 1, lbL[1], lbL[2]];
  b.raw(lbL, 'chest', { facing: 'north', type: 'left' }, 'piston', '__s');
  b.raw(lbR, 'chest', { facing: 'north', type: 'right' }, 'piston', '__s');
  // gear modules
  for (const pr of PAIRS) {
    mod[pr.y] = buildCrafterMod(b, [-cfg.modDX, ly[pr.id], cfg.modYz], pr.y, KITS[pr.y]);
    mod[pr.x] = buildCrafterMod(b, [cfg.modDX, ly[pr.id], cfg.modXz], pr.x, KITS[pr.x]);
  }
  const logChest = c2.busA;
  b.raw(logChest, 'chest', { facing: 'south', type: 'single' }, 'piston', '__s');
  // output lift: one tall water column with a dropper (and its clock) at the height of every module level; the module outputs go straight to it
  const topY = cfg.fpB[1] + 1;                                                    // exit hopper level: one below the deck, next to the dropper under the chest (see buildPlatform)
  const levelsY = PAIRS.map((pr) => ly[pr.id] - 2);                                // out hoppers of the modules sit two cells below the crafters
  const lowY = Math.min(...levelsY);
  const lift = (anchor: Pos): Lift => {
    for (let r = 0; r < 80; r++) for (let dx = -r; dx <= r; dx++) for (const dz of (Math.abs(dx) === r ? Array.from({ length: 2 * r + 1 }, (_, i) => i - r) : [-r, r])) {
      const o: Pos = [anchor[0] + dx, lowY, anchor[2] + dz];
      if (clearOfStages(cfg, o) && liftFree(b, o, lowY, topY)) return buildLift(b, o, lowY, topY, 'liftOut', [...levelsY].sort((p, q) => p - q));
    }
    throw new Error('no room for the output lift');
  };
  const outLift = lift(cfg.liftOut);
  const dropperAt = (y: number): Pos => outLift.droppers[outLift.droppers.findIndex((d) => d[1] === y)];

  // block trunks: two metered ports, each feeding two block crafters in a row (the idle tap sucks the first block that arrives, a locked tap
  // lets the next one pass; the last cell of a trunk faces a plain block): Y -> D, A    X -> B, C
  const busCells = PAIRS.map((pr) => c1[pr.id].busA);
  busCells.forEach((c, i) => b.raw(c, 'hopper', { facing: i === 1 || i === busCells.length - 1 ? 'east' : 'down' }, 'piston', '__s'));
  cv(fpB.outY, busCells[0], 'cvb0'); cv(busCells[0], busCells[1], 'cvb1');
  cv(fpB.outX, busCells[2], 'cvb2'); cv(busCells[2], busCells[3], 'cvb3');
  // conveyors: short local ones first
  for (const pr of PAIRS) { cv(feed[pr.id].outY, mod[pr.y].inD, `cv${pr.y}`); cv(feed[pr.id].outX, mod[pr.x].inD, `cv${pr.x}`); }
  cv(fpSD.outY, mod.diamond_pickaxe.inS!, 'cvsPick'); cv(fpSD.outX, mod.diamond_axe.inS!, 'cvsAxe');
  cv(fpSAB.outY, mod.diamond_shovel.inS!, 'cvsShovel'); cv(fpSAB.outX, mod.diamond_sword.inS!, 'cvsSword');
  cv(fpS0D.outY, feed.D.chestL, 'cvS0Dy'); cv(fpS0S.outY, fpSAB.chestL, 'cvS0Sy');
  cv(fpP.outY, c3D.inD, 'cvpD'); cv(fpP.outX, c3AB.inD, 'cvpAB');
  cv(fpS0D.outX, lbL, 'cvS0Dx'); cv(fpS0S.outX, lbL, 'cvS0Sx');
  // the dropper has one free side: the second module of a level feeds into the last hopper of the first one's conveyor
  for (const pr of PAIRS) {
    const p1 = conveyor(b, mod[pr.y].out, dropperAt(ly[pr.id] - 2), `cvo_${pr.y}`); hops[`cvo_${pr.y}`] = p1.length;
    let done = false;
    for (let i = p1.length - 1; i >= 1 && !done; i--) {                               // merge into the first conveyor at the nearest cell that can be reached
      try { hops[`cvo_${pr.x}`] = conveyor(b, mod[pr.x].out, p1[i], `cvo_${pr.x}`, { maxNodes: 40000 }).length; done = true; } catch { /* try the next cell */ }
    }
    if (!done) throw new Error('no conveyor for ' + pr.x);
  }
  return { b, hops, feed, c1, mod, fpB, fpP, c2, fpS0D, fpS0S, c3AB, fpSAB, fpSD, c3D, lbL, lbR, logChest, outLift };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// platform (deck with the chests the user touches) and the two lifts
export interface Platform {
  PY: number; CY: number; rowZ: number; cx: (i: number) => number;
  diamonds: Pos[]; logs: Pos[]; output: Pos[]; leftover: Pos[]; button: Pos; btnDust: Pos;
  lifts: Lift[];
}

/** Put the deck over the block feed pair: DIAMONDS right above it, LOGS down a hopper line to the log chest, OUTPUT/LEFTOVER fed by the lifts. */
/** the lift box (5 x 5 around the column) must keep away from the droppers under the OUTPUT / LEFTOVER chests, so their feed hoppers can reach them */
function clearOfStages(cfg: Cfg, o: Pos): boolean {
  const x0 = cfg.fpB[0] + 6 - 5, x1 = cfg.fpB[0] + 9 + 6, z0 = cfg.fpB[2] - 12, z1 = cfg.fpB[2] + 3;     // keep-out strip: the stage row and its oscillators
  return o[0] + 4 < x0 || o[0] - 3 > x1 || o[2] + 3 < z0 || o[2] - 3 > z1;
}

export function buildPlatform(b: Board, it: Items, cfg: Cfg, liftAnchor: { out: Pos; left: Pos } = { out: cfg.liftOut, left: cfg.liftLeft }): Platform {
  const hops = it.hops;
  const PY = cfg.fpB[1] + 3, CY = PY + 1, rowZ = cfg.fpB[2];      // two hoppers under each input half (the lower one of DIAMONDS drops into the block chest)
  const cx = (i: number) => cfg.fpB[0] + 3 * i;
  const sign = (at: Pos, facing: string, lines: string[]) => b.raw(at, 'oak_wall_sign', { facing, text: lines }, 'other');
  const dchest = (i: number): Pos[] => {
    b.raw([cx(i), CY, rowZ], 'chest', { facing: 'north', type: 'left' }, 'piston', '__s');
    b.raw([cx(i) + 1, CY, rowZ], 'chest', { facing: 'north', type: 'right' }, 'piston', '__s');
    return [[cx(i), CY, rowZ], [cx(i) + 1, CY, rowZ]];
  };
  const diamonds = dchest(0), logs = dchest(1), output = dchest(2), leftover = dchest(3);
  for (const i of [0, 1]) for (const dx of [0, 1]) b.raw([cx(i) + dx, PY, rowZ], 'hopper', { facing: 'down' }, 'piston', '__s');
  for (const dx of [0, 1]) b.raw([cx(0) + dx, PY - 1, rowZ], 'hopper', { facing: 'down' }, 'piston', '__s');
  b.raw([cx(1), PY - 1, rowZ], 'hopper', { facing: 'east' }, 'piston', '__s');
  b.raw([cx(1) + 1, PY - 1, rowZ], 'hopper', { facing: 'west' }, 'piston', '__s');
  hops.cvLogs = conveyor(b, [cx(1), PY - 1, rowZ], it.logChest, 'cvLogs').length;
  // START: a brown block IN the deck with the button on top; the wire that carries the signal runs under the deck (nothing red on the platform)
  const sx = cfg.fpB[0] - 3, sz = rowZ - 4;
  const startBlock: Pos = [sx, PY, sz];
  b.wool(startBlock, 'brown');
  const button: Pos = [sx, CY, sz];
  b.raw(button, 'stone_button', { face: 'floor', facing: 'north' }, 'lever');
  const btnDust: Pos = [sx, PY - 1, sz];
  // under OUTPUT and LEFTOVER: hopper line -> dropper D_a -> hopper G (deck gap) -> dropper D_b -> chest. Per stage a small self-gated oscillator (north of the row, below
  // the deck) pulses the block B under D_b (it touches D_a too) only while D_a holds an item, plus a short tail so that the last item can still pass G and D_b.
  const L = PY - 1, rz = rowZ, xm = cx(2) + 2;                                   // xm: the gap between the two chests (mirror axis of the two stages)
  const das: Pos[] = [];
  for (let st = 0; st < 2; st++) {
    const mx = (x: number) => (st === 0 ? x : 2 * xm - x);                     // stage 0 is drawn for the west chest; stage 1 is its mirror image
    const at = (x: number, dz: number, y = L): Pos => [mx(x), y, rz + dz];
    const nm = `stage${st}`;
    const west = (st === 0 ? 'west' : 'east') as 'west' | 'east', east = (st === 0 ? 'east' : 'west') as 'west' | 'east';
    const xa = cx(2) - 1, xb = cx(2);                                              // D_a column, B column (stage 0)
    b.raw(at(xa, 0), 'dropper', { facing: 'up' }, 'piston', '__q');
    b.raw(at(xa, 0, PY), 'hopper', { facing: east }, 'piston', '__s');
    b.raw(at(xb, 0, PY), 'dropper', { facing: 'up' }, 'piston', '__q');
    b.wool(at(xb, 0), 'cyan');
    das.push(at(xa, 0));
    b.cmp(at(xa, -1), 'north', nm + '.ka', 'cyan', 'compare');                    // reads D_a
    b.rep(at(xa, -2), 'north', 1, nm + '.kr', 'cyan');
    b.dust(at(xa, -3), nm + '.e', 'cyan');
    for (const dz of [-4, -5, -6]) b.dust(at(xa, dz), nm + '.e', 'cyan');           // direct branch -> junction Z at (xa,-6)
    b.dust(at(xa - 1, -3), nm + '.e', 'cyan');                                     // delayed branch (tail): two slow repeaters
    b.rep(at(xa - 1, -4), 'north', 4, nm + '.w1', 'cyan'); b.rep(at(xa - 1, -5), 'north', 4, nm + '.w2', 'cyan');
    b.dust(at(xa - 1, -6), nm + '.e', 'cyan');
    b.rep(at(xa, -7), 'north', 1, nm + '.re', 'cyan');
    b.cmp(at(xa, -8), 'north', nm + '.c2', 'cyan', 'subtract');
    b.rep(at(xa, -9), 'north', 1, nm + '.ry', 'cyan');
    b.dust(at(xa, -10), nm + '.y', 'cyan');
    b.rep(at(xb, -8), west, 1, nm + '.rf', 'cyan');                                // feedback into the side of C2
    for (const [x, dz] of [[xb, -10], [xb + 1, -10], [xb + 1, -9], [xb + 1, -8], [xb + 1, -7], [xb + 1, -6], [xb + 1, -5], [xb + 1, -4], [xb + 1, -3], [xb + 1, -2], [xb, -2]] as [number, number][]) b.dust(at(x, dz), nm + '.y', 'cyan');
    b.rep(at(xb, -1), 'south', 1, nm + '.rd', 'cyan');                             // into B from the north
    // hoppers next to or under the powered block B would be locked: fill those cells
    if (b.isFree(at(xb, 1))) b.wool(at(xb, 1), 'cyan');
    if (b.isFree(at(xb, 0, L - 1))) b.wool(at(xb, 0, L - 1), 'cyan');
  }
  const daOut = das[0], daLeft = das[1];
  b.floorColor = 'light_gray';
  for (let x = cfg.fpB[0] - 14; x <= cx(3) + 10; x++) for (let z = rowZ - 8; z <= rowZ + 3; z++) if (b.isFree([x, PY, z])) b.wool([x, PY, z], 'light_gray');
  b.dust(btnDust, 'startbtn', 'red');
  sign([cx(0), CY, rowZ - 1], 'north', ['', 'DIAMONDS', 'blocks in here', '']);
  sign([cx(1), CY, rowZ - 1], 'north', ['', 'OAK LOGS', 'in here', '']);
  sign([cx(2), CY, rowZ - 1], 'north', ['', 'OUTPUT', 'full set', 'comes here']);
  sign([cx(3), CY, rowZ - 1], 'north', ['', 'LEFTOVER', 'diamonds', 'and sticks']);
  b.wool([sx + 1, CY, sz], 'brown');
  sign([sx + 2, CY, sz], 'east', ['', 'START', '(press)', '']);
  // lifts
  const lifts: Lift[] = [];
  const lift = (anchor: Pos, by: number, name: string): Lift => {
    for (let r = 0; r < 80; r++) for (let dx = -r; dx <= r; dx++) for (const dz of (Math.abs(dx) === r ? Array.from({ length: 2 * r + 1 }, (_, i) => i - r) : [-r, r])) {
      const o: Pos = [anchor[0] + dx, by, anchor[2] + dz];
      if (clearOfStages(cfg, o) && liftFree(b, o, by, PY - 2)) { const l = buildLift(b, o, by, PY - 2, name); lifts.push(l); return l; }
    }
    throw new Error('no room for the ' + name + ' lift');
  };
  const outLift = it.outLift; lifts.push(outLift);
  hops.cvLiftOutTop = conveyor(b, outLift.exit, daOut, 'cvLiftOutTop').length;
  if (process.env.DEBUG_ROUTE === '6') for (let z = 5; z <= 16; z++) { let r = String(z).padStart(3) + ' '; for (let x = 0; x <= 16; x++) { const t = b.tag([x, PY - 1, z]); r += t ? (t.net === '__s' ? 'H' : t.net === '__q' ? 'Q' : t.kind[0]) : '.'; } console.log(r); }
  const leftLift = lift(liftAnchor.left, it.lbL[1] - 1, 'liftLeft');
  hops.cvLiftLeftIn = conveyor(b, [it.lbL[0], it.lbL[1] - 1, it.lbL[2]], leftLift.dropper, 'cvLiftLeftIn').length;
  hops.cvLiftLeftTop = conveyor(b, leftLift.exit, daLeft, 'cvLiftLeftTop').length;
  // keep the space above the deck free of lanes: nothing red may run over the platform
  for (let x = cfg.fpB[0] - 14; x <= cx(3) + 10; x++) for (let z = rowZ - 8; z <= rowZ + 3; z++) for (let y = PY + 1; y <= CY + 6; y++) if (b.isFree([x, y, z])) b.occ.set([x, y, z].join(','), { kind: 'reserve', net: '__deck' });
  return { PY, CY, rowZ, cx, diamonds, logs, output, leftover, button, btnDust, lifts };
}
