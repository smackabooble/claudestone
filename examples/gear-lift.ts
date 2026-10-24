/**
 * Item lift (bubble column), for the platform of the gear set. NOT proven in the real game; the sim only covers the part up to the dropper.
 *
 * Hoppers only move items sideways or down, so the items are turned into item entities by a DROPPER that fires into the bottom water cell.
 * Every dropper pulses itself only while it holds items (`selfRing`: comparator + repeater feedback), nothing runs when it is empty.
 * Soul sand under a column of water source blocks pushes the entities up; glass walls keep them in the column and a lid of plain wool
 * closes it under the deck. At the top the water spills one cell sideways over an exit hopper, which feeds a dropper (facing up) that
 * lifts the items one more level into the hopper that starts the conveyor to the platform.
 *
 *   local frame (u east, v south), column at u=0, v=0
 *   top: [water T][water E]  lid of wool above
 *        [ water ][exit hopper -> dropper (up) -> hopper H0]
 *   bot: [ water ] <- dropper D (u=-1) facing east, self-gated ring on its west side
 *        [soul sand]
 */
import type { Board } from './noglue-lib.ts';
import type { Pos } from '../src/dirs.ts';

export interface Lift {
  /** cell that the feeding conveyor must end in (the dropper) */
  dropper: Pos;
  /** the water cell the dropper fires into (the sim records the drops here) */
  base: Pos;
  /** hopper that starts the conveyor to the chest (replaced by conveyor()) */
  exit: Pos;
  /** hopper at the top of the column (the sim hands the items to it; it feeds the top dropper) */
  inner: Pos;
  clock: Pos[];
  /** a tall lift can have a dropper (with its own clock) at several levels; `dropper`/`base` are the lowest one */
  droppers: Pos[];
  bases: Pos[];
}

/** Self-gated dropper: a comparator reads the dropper, and while the dropper holds items it pulses itself (comparator in subtract mode, a repeater
 *  feedback into its side switches it off again), so nothing ticks while the dropper is empty. `sg` = -1: ring on the west side of the dropper, +1: east.
 *  Cells (relative to the dropper, v = north is -1): K (0,-1)  R0 (0,-2)  dust (0,-3) (sg,-3) (2sg,-3) (2sg,-2) (2sg,-1) (2sg,0)  Rf (sg,-1)  Rd (sg,0). */
export function selfRing(b: Board, d: Pos, sg: number, net: string): void {
  const P = (du: number, dv: number): Pos => [d[0] + du, d[1], d[2] + dv];
  const toD = sg < 0 ? 'east' : 'west';
  b.cmp(P(0, -1), 'north', net + '.k', 'cyan', 'subtract');
  b.rep(P(0, -2), 'north', 1, net + '.r0', 'cyan');
  for (const [du, dv] of [[0, -3], [sg, -3], [2 * sg, -3], [2 * sg, -2], [2 * sg, -1], [2 * sg, 0]]) b.dust(P(du, dv), net + '.d', 'cyan');
  b.rep(P(sg, -1), toD as any, 1, net + '.rf', 'cyan');
  b.rep(P(sg, 0), toD as any, 1, net + '.rd', 'cyan');
}

/** cells the lift needs, relative to the bottom water cell */
export function liftCells(by: number, topY: number): Pos[] {
  const cells: Pos[] = [];
  for (let y = by - 1; y <= topY + 2; y++) for (let du = -3; du <= 4; du++) for (let dv = -3; dv <= 3; dv++) cells.push([du, y, dv]);
  return cells;
}

export function liftFree(b: Board, o: Pos, by: number, topY: number): boolean {
  return liftCells(by, topY).every(([du, y, dv]) => b.isFree([o[0] + du, y, o[2] + dv]));
}

/** `topY` = level of the exit hopper; the top water is one above it and the lid (deck-coloured wool) one more. */
export function buildLift(b: Board, o: Pos, by: number, topY: number, name: string, levels: number[] = [by]): Lift {
  const P = (du: number, y: number, dv: number): Pos => [o[0] + du, y, o[2] + dv];
  const top = topY + 1;
  const glass = (p: Pos) => b.raw(p, 'glass', {}, 'other');
  b.raw(P(0, by - 1, 0), 'soul_sand', {}, 'other');
  for (let y = by; y <= top; y++) {
    b.raw(P(0, y, 0), 'water', { level: 0 }, 'other');
    glass(P(0, y, -1)); glass(P(0, y, 1));
    if (!levels.includes(y)) glass(P(-1, y, 0));
    if (y < topY) glass(P(1, y, 0));
  }
  // top: spill cell E (flowing water) over the exit hopper, enclosed; the lid is plain wool in the colour of the deck
  b.raw(P(1, top, 0), 'water', { level: 1 }, 'other');
  glass(P(1, top, -1)); glass(P(1, top, 1));
  b.wool(P(0, top + 1, 0), 'light_gray'); b.wool(P(1, top + 1, 0), 'light_gray');
  const inner = P(1, topY, 0);
  b.raw(inner, 'hopper', { facing: 'east' }, 'piston', '__s');
  // the exit hopper feeds a dropper (facing up, self-gated ring on its east side) that lifts the items one more level into the hopper that starts the conveyor
  const dc = P(2, topY, 0);
  b.raw(dc, 'dropper', { facing: 'up' }, 'piston', '__q');
  selfRing(b, dc, 1, name + '.top');
  const exit = P(2, top, 0);
  b.raw(exit, 'hopper', { facing: 'east' }, 'piston', '__s');
  // droppers into the water, each with its own self-gated ring
  const droppers: Pos[] = [], bases: Pos[] = [];
  levels.forEach((L, i) => {
    const dropper = P(-1, L, 0);
    b.raw(dropper, 'dropper', { facing: 'east' }, 'piston', '__q');
    selfRing(b, dropper, -1, `${name}.clk${i}`);
    droppers.push(dropper); bases.push(P(0, L, 0));
  });
  return { dropper: droppers[0], base: bases[0], exit, inner, clock: [], droppers, bases };
}

/** Sim stand-in for the water: every item the dropper fires into the base water cell reaches the exit hopper. */
export function liftShim(w: any, lifts: Lift[]): void {
  for (const l of lifts) {
    for (let i = w.drops.length - 1; i >= 0; i--) {
      const d = w.drops[i];
      if (!l.bases.some((q) => d.pos[0] === q[0] && d.pos[1] === q[1] && d.pos[2] === q[2])) continue;
      const inv = (w.items(l.inner) ?? []) as any[];
      let slot = inv.findIndex((x) => x && x.id === d.item.id && x.count < 64);
      if (slot < 0) slot = inv.findIndex((x) => !x);
      if (slot < 0) continue;                                                  // exit hopper full: the item keeps floating
      w.setItem(l.inner, slot, { id: d.item.id, count: (inv[slot]?.count ?? 0) + 1 });
      w.drops.splice(i, 1);
    }
  }
}

/** run the world in small steps with the lift stand-in (use instead of w.run when a machine has lifts) */
export function runWithLifts(w: any, lifts: Lift[], gt: number): void {
  for (let t = 0; t < gt; t += 8) { w.run(Math.min(8, gt - t)); liftShim(w, lifts); }
}
