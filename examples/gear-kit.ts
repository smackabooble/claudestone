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
  const Q = (pos: Pos, type: string, facing: string) => b.raw(pos, type, { facing }, 'piston', type === 'hopper' ? '__s' : '__q');
  Q(p(0, 0, 0), 'crafter', 'south');
  for (let s = 0; s < 9; s++) if (!spec.enabled.includes(s)) w.setSlotDisabled(p(0, 0, 0), s, true);
  // output: hopper south of the crafter (never under it), then down to the collector level
  Q(p(0, 0, 1), 'hopper', 'down'); Q(p(0, -1, 1), 'hopper', 'down'); Q(p(0, -2, 1), 'hopper', 'east');
  // craft pulse (west)
  b.floorColor = 'red';
  b.rep(p(-1, 0, 0), 'east', 1, `${name}.pc`, 'red'); b.dust(p(-2, 0, 0), `${name}.pc`, 'red'); b.dust(p(-3, 0, 0), `${name}.pc`, 'red');
  // ---- diamonds (north) ----
  Q(p(0, 0, -1), 'hopper', 'south');                                    // decoupling hopper
  Q(p(0, 0, -2), 'dropper', 'south');                                   // holds exactly one diamond
  Q(p(-1, 0, -2), 'hopper', 'east');                                    // tap hopper (bus above)
  b.rep(p(1, 0, -2), 'west', 1, `${name}.pd`, 'orange'); b.dust(p(2, 0, -2), `${name}.pd`, 'orange'); b.dust(p(3, 0, -2), `${name}.pd`, 'orange');
  // lock: comparator north of the dropper reads it, repeater restores 15, short dust loop to a repeater that powers the tap hopper
  b.cmp(p(0, 0, -3), 'north', `${name}.ld`, 'cyan', 'compare');
  b.rep(p(0, 0, -4), 'north', 1, `${name}.ld`, 'cyan');
  for (const [x, z] of [[0, -5], [-1, -5], [-2, -5], [-3, -5], [-3, -4], [-3, -3], [-3, -2]]) b.dust(p(x, 0, z), `${name}.ld`, 'cyan');
  b.rep(p(-2, 0, -2), 'east', 1, `${name}.ld`, 'cyan');
  // ---- sticks (east) ----
  if (tool) {
    Q(p(1, 0, 0), 'hopper', 'west');
    Q(p(2, 0, 0), 'dropper', 'west');
    Q(p(2, 0, -1), 'hopper', 'south');                                  // tap (bus above at y+1)
    b.rep(p(2, 0, 1), 'north', 1, `${name}.ps`, 'orange'); b.dust(p(2, 0, 2), `${name}.ps`, 'orange'); b.dust(p(2, 0, 3), `${name}.ps`, 'orange');
    b.cmp(p(3, 0, 0), 'east', `${name}.ls`, 'cyan', 'compare');
    b.rep(p(4, 0, 0), 'east', 1, `${name}.ls`, 'cyan');
    for (const [x, z] of [[5, 0], [5, -1], [4, -1]]) b.dust(p(x, 0, z), `${name}.ls`, 'cyan');
    b.rep(p(3, 0, -1), 'west', 1, `${name}.ls`, 'cyan');
  }
  return { PD: p(3, 0, -2), PS: tool ? p(2, 0, 3) : null, PC: p(-3, 0, 0), busD: p(-1, 1, -2), busS: tool ? p(2, 1, -1) : null, crafter: p(0, 0, 0), out: p(0, -2, 1) };
}

/** timeline slot length in redstone ticks (item pulses must be >= 16 gt apart; 10 rt = 20 gt) */
export const SLOT_RT = 10;

export interface TimelinePins { start: Pos; PD: Pos | null; PS: Pos | null; PC: Pos }

/**
 * Pulse timeline: a rising edge on `start` (via a comparator edge former -> 4 gt pulse) runs down a repeater chain along +z.
 * Node k (time k * SLOT_RT) fires through a diode stub into a lane (dust line along +z at x+2). Nodes 0..d-1 -> PD lane,
 * d..d+s-1 -> PS lane, d+s -> PC lane. Returns the lane end cells (the pulse pins).
 */
export function buildTimeline(b: Board, O: Pos, name: string, d: number, s: number, gap = 0): TimelinePins {
  const P = (u: number, v: number): Pos => [O[0] + u, O[1], O[2] + v];
  const net = `${name}.tl`;
  b.floorColor = 'magenta';
  b.dust(P(0, 0), `${net}.in`);                                         // start pin
  b.dust(P(0, 1), `${net}.in`); b.dust(P(1, 1), `${net}.in`); b.dust(P(2, 1), `${net}.in`); b.dust(P(2, 2), `${net}.in`);
  b.rep(P(1, 2), 'west', 2, `${net}.in`);                              // side branch: delayed copy (flows -x)
  b.cmp(P(0, 2), 'south', `${net}.in`, 'magenta', 'subtract');         // input north (rear = start), output south
  b.dust(P(0, 3), net); b.dust(P(0, 4), net); b.dust(P(0, 5), net);   // node 0 at v=5
  const nodes = d + s + gap + 1;                                          // `gap` idle nodes before the craft pulse: lets the items travel to the crafter
  const lanes: { name: 'PD' | 'PS' | 'PC'; from: number; to: number }[] = [];
  if (d > 0) lanes.push({ name: 'PD', from: 0, to: d - 1 });
  if (s > 0) lanes.push({ name: 'PS', from: d, to: d + s - 1 });
  lanes.push({ name: 'PC', from: d + s + gap, to: d + s + gap });
  let v = 5;
  const nodeV: number[] = [5];
  for (let k = 1; k < nodes; k++) {
    const delays = [4, 4, 2];
    for (let i = 0; i < 3; i++) b.rep(P(0, v + 1 + i), 'south', delays[i], net);
    v += 4; b.dust(P(0, v), net); nodeV.push(v);
  }
  const out: Record<string, Pos> = {};
  for (const ln of lanes) {
    const lnet = `${net}.${ln.name}`;
    for (let k = ln.from; k <= ln.to; k++) {
      b.rep(P(1, nodeV[k]), 'east', 1, lnet, 'orange');                 // stub: input west (node), flows east into the lane
    }
    const boost = new Set<number>();
    for (let k = ln.from; k < ln.to; k++) if ((k - ln.from) % 2 === 1) boost.add(nodeV[k] + 2);   // dust only carries 15 cells: boost the lane
    for (let vv = nodeV[ln.from]; vv <= nodeV[ln.to]; vv++) { if (boost.has(vv)) b.rep(P(2, vv), 'south', 1, lnet, 'orange'); else b.dust(P(2, vv), lnet, 'orange'); }
    out[ln.name] = P(2, nodeV[ln.to] + 1);
    b.dust(out[ln.name], lnet, 'orange');
  }
  return { start: P(0, 0), PD: out.PD ?? null, PS: out.PS ?? null, PC: out.PC };
}
