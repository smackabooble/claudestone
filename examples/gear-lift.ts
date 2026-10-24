/**
 * Item lift (bubble column), for the platform of the gear set. NOT proven in the real game; the sim only covers the part up to the dropper.
 *
 * Hoppers only move items sideways or down, so the items are turned into item entities by a DROPPER that fires into the bottom water cell.
 * A hopper clock (two hoppers passing one item back and forth, read by a comparator) pulses the dropper, so it empties itself by itself.
 * Soul sand under a column of water source blocks pushes the entities up; glass walls and a glass lid keep them in the column. At the top
 * the water spills one cell sideways; the entities drift over an exit hopper that carries them on (hopper line to the chest).
 *
 *        glass lid                local frame (u east, v south), column at u=0, v=0
 *   top: [water T][water E]          D  = dropper at u=-1 facing east into the bottom water cell
 *        [ water ][glass ]  <- exit hopper under E (one level below the top water)
 *        [ water ][glass ]
 *   bot: [ water ][glass ]  <- dropper D, comparator C (north of D's clock), clock hoppers H1 H2 two cells south
 *        [soul sand]
 */
import type { Board } from './noglue-lib.ts';
import type { Pos } from '../src/dirs.ts';

export interface Lift {
  /** cell that the feeding conveyor must end in (the dropper) */
  dropper: Pos;
  /** the water cell the dropper fires into (the sim records the drops here) */
  base: Pos;
  /** exit hopper: start of the conveyor to the chest (replaced by conveyor()) */
  exit: Pos;
  /** the clock hoppers (H1 holds the seed item) */
  clock: Pos[];
  /** a tall lift can have a dropper (with its own clock) at several levels; `dropper`/`base` are the lowest one */
  droppers: Pos[];
  bases: Pos[];
}

/** cells the lift needs, relative to the bottom water cell */
export function liftCells(by: number, topY: number): Pos[] {
  const cells: Pos[] = [];
  for (let y = by - 1; y <= topY + 2; y++) for (let du = -2; du <= 2; du++) for (let dv = -1; dv <= 3; dv++) cells.push([du, y, dv]);
  return cells;
}

export function liftFree(b: Board, o: Pos, by: number, topY: number): boolean {
  return liftCells(by, topY).every(([du, y, dv]) => b.isFree([o[0] + du, y, o[2] + dv]));
}

export function buildLift(b: Board, o: Pos, by: number, topY: number, name: string, levels: number[] = [by]): Lift {
  const P = (du: number, y: number, dv: number): Pos => [o[0] + du, y, o[2] + dv];
  const top = topY + 1;                                                       // top water level (the exit hopper is one below)
  const glass = (p: Pos) => b.raw(p, 'glass', {}, 'other');
  b.raw(P(0, by - 1, 0), 'soul_sand', {}, 'other');
  for (let y = by; y <= top; y++) {
    b.raw(P(0, y, 0), 'water', { level: 0 }, 'other');
    glass(P(0, y, -1)); glass(P(0, y, 1));
    if (!levels.includes(y)) glass(P(-1, y, 0));
    if (y < topY) glass(P(1, y, 0));
  }
  // top: spill cell E (flowing water) over the exit hopper, enclosed
  b.raw(P(1, top, 0), 'water', { level: 1 }, 'other');
  glass(P(1, top, -1)); glass(P(1, top, 1)); glass(P(2, top, 0));
  glass(P(0, top + 1, 0)); glass(P(1, top + 1, 0));
  const exit = P(1, topY, 0);
  b.raw(exit, 'hopper', { facing: 'east' }, 'piston', '__s');
  // droppers into the water, each with its own hopper clock
  const droppers: Pos[] = [], bases: Pos[] = [], clock: Pos[] = [];
  levels.forEach((L, i) => {
    const dropper = P(-1, L, 0);
    b.raw(dropper, 'dropper', { facing: 'east' }, 'piston', '__q');
    b.cmp(P(-1, L, 1), 'north', `${name}.clk${i}`, 'cyan', 'compare');          // reads H1 (south of it), powers the dropper (north of it)
    const h1 = P(-1, L, 2), h2 = P(0, L, 2);
    b.raw(h1, 'hopper', { facing: 'east' }, 'piston', '__s');
    b.raw(h2, 'hopper', { facing: 'west' }, 'piston', '__s');
    b.w.setItem(h1, 0, { id: 'stick', count: 1 });                               // the clock's one seed item
    droppers.push(dropper); bases.push(P(0, L, 0)); clock.push(h1, h2);
  });
  return { dropper: droppers[0], base: bases[0], exit, clock, droppers, bases };
}

/** Sim stand-in for the water: every item the dropper fires into the base water cell reaches the exit hopper. */
export function liftShim(w: any, lifts: Lift[]): void {
  for (const l of lifts) {
    for (let i = w.drops.length - 1; i >= 0; i--) {
      const d = w.drops[i];
      if (!l.bases.some((q) => d.pos[0] === q[0] && d.pos[1] === q[1] && d.pos[2] === q[2])) continue;
      const inv = (w.items(l.exit) ?? []) as any[];
      let slot = inv.findIndex((x) => x && x.id === d.item.id && x.count < 64);
      if (slot < 0) slot = inv.findIndex((x) => !x);
      if (slot < 0) continue;                                                  // exit hopper full: the item keeps floating
      w.setItem(l.exit, slot, { id: d.item.id, count: (inv[slot]?.count ?? 0) + 1 });
      w.drops.splice(i, 1);
    }
  }
}

/** run the world in small steps with the lift stand-in (use instead of w.run when a machine has lifts) */
export function runWithLifts(w: any, lifts: Lift[], gt: number): void {
  for (let t = 0; t < gt; t += 8) { w.run(Math.min(8, gt - t)); liftShim(w, lifts); }
}
