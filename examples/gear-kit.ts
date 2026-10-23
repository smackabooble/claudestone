/**
 * Kit unit for the gear machine (sim-tested). A crafter is fed by droppers that each hold exactly ONE item
 * (a comparator on the dropper locks the tap hopper above/next to it), so every pulse hands the crafter exactly one
 * item. A hopper between dropper and crafter decouples the layout. Pulse pins: PD (diamond dropper), PS (stick dropper),
 * PC (craft). Local frame: crafter at O facing south, y = O[1]; x east, z south.
 */
import { Board, route, assignRepeaters } from './noglue-lib.ts';
import type { Pos } from '../src/dirs.ts';

export interface KitSpec { enabled: number[]; diamonds: number; sticks: number }
export const KITS: Record<string, KitSpec> = {
  diamond_helmet: { enabled: [0, 1, 2, 3, 5], diamonds: 5, sticks: 0 },
  diamond_chestplate: { enabled: [0, 2, 3, 4, 5, 6, 7, 8], diamonds: 8, sticks: 0 },
  diamond_leggings: { enabled: [0, 1, 2, 3, 5, 6, 8], diamonds: 7, sticks: 0 },
  diamond_boots: { enabled: [3, 5, 6, 8], diamonds: 4, sticks: 0 },
  diamond_sword: { enabled: [1, 4, 7], diamonds: 2, sticks: 1 },
  diamond_pickaxe: { enabled: [0, 1, 2, 4, 7], diamonds: 3, sticks: 2 },
  diamond_axe: { enabled: [0, 1, 3, 4, 7], diamonds: 3, sticks: 2 },
  diamond_shovel: { enabled: [1, 4, 7], diamonds: 1, sticks: 2 },
};

export interface KitPins { PD: Pos; PS: Pos | null; PC: Pos; busD: Pos; busS: Pos | null; crafter: Pos; out: Pos }

export function buildKit(b: Board, O: Pos, name: string, spec: KitSpec): KitPins {
  const p = (x: number, y: number, z: number): Pos => [O[0] + x, O[1] + y, O[2] + z];
  const w = b.w;
  const tool = spec.sticks > 0;
  const routed: { path: Pos[]; net: string }[] = [];
  b.raw(p(0, 0, 0), 'crafter', { facing: 'south' }, 'piston', '__q');
  for (let s = 0; s < 9; s++) if (!spec.enabled.includes(s)) w.setSlotDisabled(p(0, 0, 0), s, true);
  // output: hopper south of the crafter (never under it), then down to the collector level
  b.raw(p(0, 0, 1), 'hopper', { facing: 'down' }, 'piston', '__s'); b.raw(p(0, -1, 1), 'hopper', { facing: 'down' }, 'piston', '__s'); b.raw(p(0, -2, 1), 'hopper', { facing: 'east' }, 'piston', '__s');
  // craft pulse
  b.floorColor = 'red';
  b.rep(p(-1, 0, 0), 'east', 1, `${name}.pc`, 'red'); b.dust(p(-2, 0, 0), `${name}.pc`, 'red');
  // ---- diamonds (north) ----
  b.raw(p(0, 0, -1), 'hopper', { facing: 'south' }, 'piston', '__s');          // decoupling hopper
  b.raw(p(0, 0, -2), 'dropper', { facing: 'south' }, 'piston', '__q');         // holds exactly one diamond
  b.raw(p(-1, 0, -2), 'hopper', { facing: 'east' }, 'piston', '__s');          // tap hopper (bus above)
  b.rep(p(0, 0, -3), 'south', 1, `${name}.pd`, 'orange'); b.dust(p(0, 0, -4), `${name}.pd`, 'orange');
  b.cmp(p(1, 0, -2), 'east', `${name}.ld`, 'cyan', 'compare');        // reads the dropper (west of it)
  b.rep(p(2, 0, -2), 'east', 1, `${name}.ld`, 'cyan'); b.dust(p(3, 0, -2), `${name}.ld`, 'cyan');
  b.rep(p(-2, 0, -2), 'east', 1, `${name}.ld`, 'cyan'); b.dust(p(-3, 0, -2), `${name}.ld`, 'cyan');
  routed.push({ path: route(b, p(3, 0, -2), p(-3, 0, -2), `${name}.ld`, { floor: 'cyan' }), net: `${name}.ld` });
  // ---- sticks (east) ----
  if (tool) {
    b.raw(p(1, 0, 0), 'hopper', { facing: 'west' }, 'piston', '__s');
    b.raw(p(2, 0, 0), 'dropper', { facing: 'west' }, 'piston', '__q');
    b.raw(p(2, 0, -1), 'hopper', { facing: 'south' }, 'piston', '__s');        // tap (bus above at y+1)
    b.rep(p(2, 0, 1), 'north', 1, `${name}.ps`, 'orange'); b.dust(p(2, 0, 2), `${name}.ps`, 'orange');
    b.cmp(p(3, 0, 0), 'east', `${name}.ls`, 'cyan', 'compare');       // reads the dropper (west of it)
    b.rep(p(4, 0, 0), 'east', 1, `${name}.ls`, 'cyan'); b.dust(p(5, 0, 0), `${name}.ls`, 'cyan');
    b.rep(p(3, 0, -1), 'west', 1, `${name}.ls`, 'cyan'); b.dust(p(4, 0, -1), `${name}.ls`, 'cyan');
    routed.push({ path: route(b, p(5, 0, 0), p(4, 0, -1), `${name}.ls`, { floor: 'cyan' }), net: `${name}.ls` });
  }
  for (const r of routed) assignRepeaters(b, r.path, r.net);
  return { PD: p(0, 0, -4), PS: tool ? p(2, 0, 2) : null, PC: p(-2, 0, 0), busD: p(-1, 1, -2), busS: tool ? p(2, 1, -1) : null, crafter: p(0, 0, 0), out: p(0, -2, 1) };
}
