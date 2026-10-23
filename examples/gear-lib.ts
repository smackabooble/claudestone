/** Building blocks for the diamond gear set machine (sim-tested): tool-unit logic, latch, helpers. */
import { Board } from './noglue-lib.ts';
import type { Pos } from '../src/dirs.ts';

export interface LogicPins { A: Pos; B: Pos; START: Pos; LD: Pos; LS: Pos }

/**
 * Tool-unit logic (flat, y = origin y). Local (u east, v south) from origin O.
 * Inputs : A (diamonds done), B (recipe full), START (reset).  Outputs: LD = A or Q (lock diamond hopper), LS = not A or Q.
 * Q is a comparator + repeater latch: set by B, reset by START.
 */
export function buildToolLogic(b: Board, O: Pos, net = 'logic'): LogicPins {
  const P = (u: number, v: number): Pos => [O[0] + u, O[1], O[2] + v];
  b.floorColor = 'cyan';
  // latch
  b.cmp(P(6, 0), 'east', `${net}.latch`);                 // input west (5,0), output east (7,0)
  b.dust(P(5, 0), `${net}.latch`);
  b.dust(P(7, 0), `${net}.latch`); b.dust(P(7, 1), `${net}.latch`);
  b.rep(P(6, 1), 'west', 1, `${net}.latch`);
  b.dust(P(5, 1), `${net}.latch`);
  b.rep(P(6, -1), 'south', 1, `${net}.latch`);            // reset repeater into the comparator's north side
  // B set path: pin (0,0) -> (3,0) -> diode (4,0) -> (5,0)
  for (let u = 0; u <= 3; u++) b.dust(P(u, 0), `${net}.b`);
  b.rep(P(4, 0), 'east', 1, `${net}.b`);
  // START pin
  b.dust(P(6, -2), `${net}.start`);
  // Q tap
  b.rep(P(5, 2), 'south', 1, `${net}.q`);
  for (let v = 3; v <= 9; v++) b.dust(P(5, v), `${net}.q`);
  b.dust(P(4, 4), `${net}.q`); b.dust(P(4, 9), `${net}.q`);
  // A line
  for (let v = 3; v <= 7; v++) b.dust(P(0, v), `${net}.a`);
  // LD = A or Q
  b.rep(P(1, 4), 'east', 1, `${net}.ld`);
  b.dust(P(2, 4), `${net}.ld`);
  b.rep(P(3, 4), 'west', 1, `${net}.ld`);
  b.dust(P(2, 3), `${net}.ld`);
  // LS = not A or Q
  b.rep(P(1, 7), 'east', 1, `${net}.ls`);
  b.raw(P(2, 6), 'redstone_block', {}, 'other');
  b.cmp(P(2, 7), 'south', `${net}.ls`);                    // input north = redstone block, side west = A diode
  b.dust(P(2, 8), `${net}.ls`);
  b.dust(P(2, 9), `${net}.ls`);
  b.rep(P(3, 9), 'west', 1, `${net}.ls`);
  b.dust(P(2, 10), `${net}.ls`);
  return { A: P(0, 3), B: P(0, 0), START: P(6, -2), LD: P(2, 3), LS: P(2, 10) };
}

import { route, assignRepeaters } from './noglue-lib.ts';

export interface ToolSpec {
  /** crafter slots that stay enabled (0..8); all others are disabled */
  enabled: number[];
  /** diamonds / sticks needed (sticks 0 = armour: single material) */
  diamonds: number; sticks: number;
}
export const TOOLS: Record<string, ToolSpec> = {
  diamond_sword: { enabled: [1, 4, 7], diamonds: 2, sticks: 1 },
  diamond_pickaxe: { enabled: [0, 1, 2, 4, 7], diamonds: 3, sticks: 2 },
  diamond_axe: { enabled: [0, 1, 3, 4, 7], diamonds: 3, sticks: 2 },
  diamond_shovel: { enabled: [1, 4, 7], diamonds: 1, sticks: 2 },
};

/**
 * One tool crafter with its metering logic (local frame, crafter at O, y = O[1]).
 *  feeds : diamond hopper north (0,0,-1) with bus hopper above at (0,1,-1); stick hopper on top (0,1,0) with bus hopper at (0,2,0)
 *  output: crafter faces south into a hopper (0,0,1) -> two more down -> collector hopper (0,-2,1) facing east
 */
export function buildToolUnit(b: Board, O: Pos, name: string, spec: ToolSpec): { start: Pos; crafter: Pos; busD: Pos; busS: Pos; out: Pos } {
  const p = (x: number, y: number, z: number): Pos => [O[0] + x, O[1] + y, O[2] + z];
  const w = b.w;
  // machine
  b.raw(p(0, 0, 0), 'crafter', { facing: 'south' }, 'other');
  for (let s = 0; s < 9; s++) if (!spec.enabled.includes(s)) w.setSlotDisabled(p(0, 0, 0), s, true);
  b.raw(p(0, 0, -1), 'hopper', { facing: 'south' }, 'other');       // diamond feed
  b.raw(p(0, 1, 0), 'hopper', { facing: 'down' }, 'other');         // stick feed
  b.raw(p(0, 0, 1), 'hopper', { facing: 'down' }, 'other');         // output (a hopper UNDER a crafter would drain its slots)
  b.raw(p(0, -1, 1), 'hopper', { facing: 'down' }, 'other');
  b.raw(p(0, -2, 1), 'hopper', { facing: 'east' }, 'other');        // collector level
  // readout: crafter -> CR1 -> D0 -> CA / CB
  b.floorColor = 'magenta';
  b.cmp(p(1, 0, 0), 'east', `${name}.rd`, 'magenta', 'compare');
  b.dust(p(2, 0, 0), `${name}.rd`);
  const disabled = 9 - spec.enabled.length;
  const Td = disabled + spec.diamonds;                              // count when the diamond slots are full
  const constA = Td - 1, constB = 8;
  b.cmp(p(2, 0, -1), 'north', `${name}.rd`, 'magenta', 'subtract'); // reads D0 (south), output north
  b.cmp(p(2, 0, 1), 'south', `${name}.rd`, 'magenta', 'subtract');  // reads D0 (north), output south
  const ruler = (z: number, c: number) => {
    const j = 16 - c;
    for (let i = 0; i < j; i++) b.dust(p(3 + i, 0, z), `${name}.ruler${z}`, 'white');
    b.raw(p(3 + j, 0, z), 'redstone_block', {}, 'other');
  };
  ruler(-1, constA); ruler(1, constB);
  b.rep(p(2, 0, -2), 'north', 1, `${name}.lg.a`, 'magenta'); b.dust(p(2, 0, -3), `${name}.lg.a`, 'magenta');
  b.rep(p(2, 0, 2), 'south', 1, `${name}.lg.b`, 'magenta'); b.dust(p(2, 0, 3), `${name}.lg.b`, 'magenta');
  // trigger: wool west of the crafter powered by a repeater from the north
  b.floorColor = 'red';
  b.raw(p(-1, 0, 0), 'red_wool', {}, 'wool');
  b.rep(p(-1, 0, 1), 'north', 1, `${name}.lg.b`, 'red'); b.dust(p(-1, 0, 2), `${name}.lg.b`, 'red');
  // locks
  b.rep(p(0, 0, -2), 'south', 1, `${name}.lg.ld`, 'red'); b.dust(p(0, 0, -3), `${name}.lg.ld`, 'red');
  b.rep(p(-1, 1, 0), 'east', 1, `${name}.lg.ls`, 'red'); b.dust(p(-2, 1, 0), `${name}.lg.ls`, 'red');
  // logic block north-west
  const LO = p(-16, 0, -14);
  const lg = buildToolLogic(b, LO, `${name}.lg`);
  const routed: { path: Pos[]; net: string }[] = [];
  const link = (from: Pos, to: Pos, net: string) => { routed.push({ path: route(b, from, to, net), net }); };
  b.floorColor = 'lime';
  link(lg.LD, p(0, 0, -3), `${name}.lg.ld`);
  link(lg.LS, p(-2, 1, 0), `${name}.lg.ls`);
  link(p(2, 0, -3), lg.A, `${name}.lg.a`);
  link(p(2, 0, 3), lg.B, `${name}.lg.b`);
  link(p(2, 0, 3), p(-1, 0, 2), `${name}.lg.b`);
  for (const r of routed) assignRepeaters(b, r.path, r.net);
  return { start: lg.START, crafter: p(0, 0, 0), busD: p(0, 1, -1), busS: p(0, 2, 0), out: p(0, -2, 1) };
}
