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

export interface TimelinePins { start: Pos; PD: Pos | null; PS: Pos | null; PC: Pos; /** extra copies of the PC pulse (one repeater later) for fan-out */ PCalt?: Pos[] }

/**
 * Pulse timeline: a rising edge on `start` (via a comparator edge former -> 4 gt pulse) runs down a repeater chain along +z.
 * Node k (time k * SLOT_RT) fires through a diode stub into a lane (dust line along +z at x+2). Nodes 0..d-1 -> PD lane,
 * d..d+s-1 -> PS lane, d+s -> PC lane. Returns the lane end cells (the pulse pins).
 */
export interface TimelineOpts {
  /** idle time (redstone ticks) between the start signal and node 0: a folded repeater snake in front of the start pin */
  preRt?: number;
  /** the PS lane taps the first `s` nodes (same moments as the first PD pulses) instead of getting its own nodes after the PD ones */
  parallelS?: boolean;
}
/** rows of the folded snake for a delay (same rule as the snake helper inside buildTimeline) */
export function snakeRows(delayRt: number, evenRows: boolean): number {
  const nRep = Math.max(1, Math.ceil(delayRt / 4)); let rows = Math.ceil(nRep / 5); if (evenRows && rows % 2 === 1) rows++; return rows;
}

export function buildTimeline(b: Board, O: Pos, name: string, d: number, s: number, gap = 0, gapS = 0, noPC = false, opts: TimelineOpts = {}): TimelinePins {
  const pre = opts.preRt ?? 0;
  const preRows = pre > 0 ? snakeRows(pre, true) : 0;
  const v0pre = -5 - 2 * (preRows - 1);                                      // the pre-delay snake ends at v = -2, its last cell joins the start pin at v = -1
  const zshift = pre > 0 ? -(v0pre + 1) : 0;
  const P = (u: number, v: number): Pos => [O[0] + u, O[1], O[2] + v + zshift];
  const net = `${name}.tl`;
  b.floorColor = 'magenta';
  b.dust(P(0, -1), `${net}.in`);                                        // start pin (weak signals are fine: the repeater restores them)
  b.rep(P(0, 0), 'south', 1, `${net}.in`);
  b.dust(P(0, 1), `${net}.in`); b.dust(P(1, 1), `${net}.in`); b.dust(P(2, 1), `${net}.in`); b.dust(P(2, 2), `${net}.in`);
  b.rep(P(1, 2), 'west', 2, `${net}.in`);                              // side branch: delayed copy (flows -x)
  b.cmp(P(0, 2), 'south', `${net}.in`, 'magenta', 'subtract');         // input north (rear = start), output south
  b.dust(P(0, 3), net); b.dust(P(0, 4), net); b.dust(P(0, 5), net);   // node 0 at v=5
  const nodes = opts.parallelS ? Math.max(d, s) : d + s;                  // data nodes (every pulse is one node, SLOT_RT apart)
  const lanes: { name: 'PD' | 'PS'; from: number; to: number }[] = [];
  if (d > 0) lanes.push({ name: 'PD', from: 0, to: d - 1 });
  if (s > 0) lanes.push(opts.parallelS ? { name: 'PS', from: 0, to: s - 1 } : { name: 'PS', from: d, to: d + s - 1 });
  /** a folded repeater snake of `delayRt` redstone ticks starting below the dust cell P(0, v0); rows along x (5 wide), growing along +z.
   *  Waiting time is the same as a run of idle chain nodes, but 2.5x denser and folded. Returns the last cell (x, z). */
  const snake = (v0: number, delayRt: number, snet: string, evenRows: boolean): { x: number; z: number } => {
    b.floorColor = 'orange';
    b.dust(P(0, v0 + 1), snet, 'orange'); b.dust(P(0, v0 + 2), snet, 'orange');
    let z = v0 + 3;
    b.dust(P(0, z), snet, 'orange');
    const nRep = Math.max(1, Math.ceil(delayRt / 4));
    let rows = Math.ceil(nRep / 5); if (evenRows && rows % 2 === 1) rows++;
    const L = Math.max(1, Math.ceil(nRep / rows));
    const nTot = rows * L, base = Math.floor(delayRt / nTot);
    if (base < 1) throw new Error(`snake: ${delayRt} rt is too short for ${nTot} repeaters`);
    let rem = delayRt - base * nTot, east = true, last = { x: 0, z };
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < L; i++) {
        let dly = base; if (rem > 0 && dly < 4) { dly++; rem--; }
        b.rep(P(east ? 1 + i : L - i, z), east ? 'east' : 'west', Math.min(4, dly), snet, 'orange');
      }
      const ex = east ? L + 1 : 0;
      b.dust(P(ex, z), snet, 'orange'); last = { x: ex, z };
      if (r < rows - 1) { b.dust(P(ex, z + 1), snet, 'orange'); b.dust(P(ex, z + 2), snet, 'orange'); z += 2; last = { x: ex, z }; east = !east; }
    }
    return last;
  };
  if (pre > 0) snake(v0pre, pre, `${net}.in`, true);                       // pre-delay in front of the start pin
  let v = 5;
  const nodeV: number[] = [5];
  for (let k = 1; k < nodes; k++) {
    if (k === d && gapS > 0) {                                           // idle time between the diamond and the stick pulses
      const e = snake(v, (gapS + 1) * SLOT_RT, net, true);
      b.dust(P(0, e.z + 1), net, 'orange'); b.dust(P(0, e.z + 2), net, 'orange');
      v = e.z + 3; b.dust(P(0, v), net, 'orange'); nodeV.push(v);
      continue;
    }
    const delays = [4, 4, 2];
    for (let i = 0; i < 3; i++) b.rep(P(0, v + 1 + i), 'south', delays[i], net);
    v += 4; b.dust(P(0, v), net); nodeV.push(v);
  }
  const out: Record<string, Pos> = {};
  for (const ln of lanes) {
    const lnet = `${net}.${ln.name}`;
    const west = !!opts.parallelS && ln.name === 'PS';                     // a lane that shares its nodes with PD runs on the other side of the node chain
    const sg = west ? -1 : 1;
    for (let k = ln.from; k <= ln.to; k++) {
      b.rep(P(sg, nodeV[k]), west ? 'west' : 'east', 1, lnet, 'orange');   // stub: input from the node, flows into the lane
    }
    const boost = new Set<number>();
    for (let k = ln.from; k < ln.to; k++) if ((k - ln.from) % 2 === 1) boost.add(nodeV[k] + 2);   // dust only carries 15 cells: boost the lane
    for (let vv = nodeV[ln.from]; vv <= nodeV[ln.to]; vv++) { if (boost.has(vv)) b.rep(P(2 * sg, vv), 'south', 1, lnet, 'orange'); else b.dust(P(2 * sg, vv), lnet, 'orange'); }
    out[ln.name] = P(2 * sg, nodeV[ln.to] + 1);
    b.dust(out[ln.name], lnet, 'orange');
  }
  // craft pulse: `gap + 1` slots after the last data node
  const startPin = pre > 0 ? P(0, v0pre + 1) : P(0, -1);
  if (noPC) return { start: startPin, PD: out.PD ?? null, PS: out.PS ?? null, PC: P(0, -1) };
  const pc = snake(nodeV[nodeV.length - 1], (gap + 1) * SLOT_RT, `${net}.PC`, false);
  // four full-strength copies of the PC pulse: repeater -> dust hub -> repeaters east/west, north, south -> dust stems -> pins, plus one repeater south of the end cell
  // (the stems keep every pin a few cells away from the other pins, so a lane can leave each of them)
  const dx = pc.x > 0 ? 1 : -1, pnet = `${net}.PC`, STEM = 3;
  const stem = (x0: number, z0: number, ux: number, uz: number, flow: 'east' | 'west' | 'north' | 'south'): Pos => {
    b.rep(P(x0 + ux, z0 + uz), flow, 1, pnet, 'orange');
    for (let k = 2; k <= STEM + 1; k++) b.dust(P(x0 + ux * k, z0 + uz * k), pnet, 'orange');
    return P(x0 + ux * (STEM + 1), z0 + uz * (STEM + 1));
  };
  b.rep(P(pc.x + dx, pc.z), dx > 0 ? 'east' : 'west', 1, pnet, 'orange'); b.dust(P(pc.x + 2 * dx, pc.z), pnet, 'orange');
  const pcs = [
    stem(pc.x + 2 * dx, pc.z, dx, 0, dx > 0 ? 'east' : 'west'),
    stem(pc.x + 2 * dx, pc.z, 0, -1, 'north'),
    stem(pc.x + 2 * dx, pc.z, 0, 1, 'south'),
    stem(pc.x, pc.z, 0, 1, 'south'),
  ];
  return { start: startPin, PD: out.PD ?? null, PS: out.PS ?? null, PC: pcs[0], PCalt: pcs.slice(1) };
}
