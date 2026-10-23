/**
 * Parts of the gear set machine (sim-tested):
 *  - buildFeedPair : a double-chest stash with TWO metered ports (each: tap hopper under a chest half -> dropper that holds exactly
 *                    one item, comparator-locked tap, pulse pin). A pulse releases exactly one item into the port's output hopper.
 *  - buildCrafterMod: a crafter with its input hoppers, craft pulse, output chain.
 * Items travel between parts on hopper conveyors (noglue-lib `conveyor`).
 */
import { Board } from './noglue-lib.ts';
import type { Pos } from '../src/dirs.ts';
import type { KitSpec } from './gear-kit.ts';

export interface FeedPair {
  chestL: Pos; chestR: Pos;
  outY: Pos; outX: Pos;            // hoppers that start the conveyors (west / east of the stash)
  pulseY: Pos; pulseX: Pos;        // outer dust pins (approach from south for Y, from north for X)
}

export function buildFeedPair(b: Board, O: Pos, name: string): FeedPair {
  const p = (x: number, y: number, z: number): Pos => [O[0] + x, O[1] + y, O[2] + z];
  const S = (pos: Pos, type: string, facing: string) => b.raw(pos, type, { facing }, 'piston', type === 'hopper' ? '__s' : '__q');
  b.raw(p(0, 1, 0), 'chest', { facing: 'north', type: 'left' }, 'piston', '__s');
  b.raw(p(1, 1, 0), 'chest', { facing: 'north', type: 'right' }, 'piston', '__s');
  // ---- port Y (west) ----
  S(p(0, 0, 0), 'hopper', 'west');                  // tap under the left half
  S(p(-1, 0, 0), 'dropper', 'west');
  S(p(-2, 0, 0), 'hopper', 'south');                // output (conveyor start)
  b.floorColor = 'cyan';
  b.cmp(p(-1, 0, -1), 'north', `${name}.ly`, 'cyan', 'compare');
  b.rep(p(-1, 0, -2), 'north', 1, `${name}.ly`, 'cyan');
  for (const [x, z] of [[-1, -3], [0, -3], [0, -2]]) b.dust(p(x, 0, z), `${name}.ly`, 'cyan');
  b.rep(p(0, 0, -1), 'south', 1, `${name}.ly`, 'cyan');
  b.floorColor = 'orange';
  b.rep(p(-1, 0, 1), 'north', 1, `${name}.py`, 'orange'); b.dust(p(-1, 0, 2), `${name}.py`, 'orange'); b.dust(p(-1, 0, 3), `${name}.py`, 'orange');
  // ---- port X (east) ----
  S(p(1, 0, 0), 'hopper', 'east');
  S(p(2, 0, 0), 'dropper', 'east');
  S(p(3, 0, 0), 'hopper', 'south');
  b.floorColor = 'cyan';
  b.cmp(p(2, 0, 1), 'south', `${name}.lx`, 'cyan', 'compare');
  b.rep(p(2, 0, 2), 'south', 1, `${name}.lx`, 'cyan');
  for (const [x, z] of [[2, 3], [1, 3], [1, 2]]) b.dust(p(x, 0, z), `${name}.lx`, 'cyan');
  b.rep(p(1, 0, 1), 'north', 1, `${name}.lx`, 'cyan');
  b.floorColor = 'orange';
  b.rep(p(2, 0, -1), 'south', 1, `${name}.px`, 'orange'); b.dust(p(2, 0, -2), `${name}.px`, 'orange'); b.dust(p(2, 0, -3), `${name}.px`, 'orange');
  return { chestL: p(0, 1, 0), chestR: p(1, 1, 0), outY: p(-2, 0, 0), outX: p(3, 0, 0), pulseY: p(-1, 0, 3), pulseX: p(2, 0, -3) };
}

export interface CrafterMod { crafter: Pos; inD: Pos; inS: Pos | null; pulseC: Pos; out: Pos }

export function buildCrafterMod(b: Board, O: Pos, name: string, spec: KitSpec): CrafterMod {
  const p = (x: number, y: number, z: number): Pos => [O[0] + x, O[1] + y, O[2] + z];
  const S = (pos: Pos, type: string, facing: string) => b.raw(pos, type, { facing }, 'piston', type === 'hopper' ? '__s' : '__q');
  const w = b.w;
  S(p(0, 0, 0), 'crafter', 'south');
  for (let s = 0; s < 9; s++) if (!spec.enabled.includes(s)) w.setSlotDisabled(p(0, 0, 0), s, true);
  S(p(0, 0, 1), 'hopper', 'down'); S(p(0, -1, 1), 'hopper', 'down'); S(p(0, -2, 1), 'hopper', 'east');
  S(p(0, 0, -1), 'hopper', 'south');                                     // diamond input hopper
  if (spec.sticks > 0) S(p(1, 0, 0), 'hopper', 'west');                  // stick input hopper
  b.floorColor = 'red';
  b.rep(p(-1, 0, 0), 'east', 1, `${name}.pc`, 'red'); b.dust(p(-2, 0, 0), `${name}.pc`, 'red'); b.dust(p(-3, 0, 0), `${name}.pc`, 'red');
  return { crafter: p(0, 0, 0), inD: p(0, 0, -1), inS: spec.sticks > 0 ? p(1, 0, 0) : null, pulseC: p(-3, 0, 0), out: p(0, -2, 1) };
}

import { route, assignRepeaters, conveyor } from './noglue-lib.ts';
import { buildTimeline } from './gear-kit.ts';

/** a crafter that crafts `a` pulses' worth of one item type delivered through its own metered dropper (used for the block / log / plank crafters);
 *  output goes straight into the container in front (south of the crafter). */
export interface DirectKit { crafter: Pos; busA: Pos; PD: Pos; PC: Pos }
export function buildDirectKit(b: Board, O: Pos, name: string, enabled: number[], facing = 'south'): DirectKit {
  const p = (x: number, y: number, z: number): Pos => [O[0] + x, O[1] + y, O[2] + z];
  const S = (pos: Pos, type: string, facing: string) => b.raw(pos, type, { facing }, 'piston', type === 'hopper' ? '__s' : '__q');
  const w = b.w;
  S(p(0, 0, 0), 'crafter', facing);
  for (let s = 0; s < 9; s++) if (!enabled.includes(s)) w.setSlotDisabled(p(0, 0, 0), s, true);
  b.floorColor = 'red';
  b.rep(p(-1, 0, 0), 'east', 1, `${name}.pc`, 'red'); b.dust(p(-2, 0, 0), `${name}.pc`, 'red'); b.dust(p(-3, 0, 0), `${name}.pc`, 'red');
  S(p(0, 0, -1), 'hopper', 'south');
  S(p(0, 0, -2), 'dropper', 'south');
  S(p(-1, 0, -2), 'hopper', 'east');                                    // tap; the item bus / chest goes above at (-1,1,-2)
  b.rep(p(1, 0, -2), 'west', 1, `${name}.pd`, 'orange'); b.dust(p(2, 0, -2), `${name}.pd`, 'orange'); b.dust(p(3, 0, -2), `${name}.pd`, 'orange');
  b.cmp(p(0, 0, -3), 'north', `${name}.ld`, 'cyan', 'compare');
  b.rep(p(0, 0, -4), 'north', 1, `${name}.ld`, 'cyan');
  for (const [x, z] of [[0, -5], [-1, -5], [-2, -5], [-3, -5], [-3, -4], [-3, -3], [-3, -2]]) b.dust(p(x, 0, z), `${name}.ld`, 'cyan');
  b.rep(p(-2, 0, -2), 'east', 1, `${name}.ld`, 'cyan');
  return { crafter: p(0, 0, 0), busA: p(-1, 1, -2), PD: p(3, 0, -2), PC: p(-3, 0, 0) };
}
