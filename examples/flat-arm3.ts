/**
 * Flat TRIPLE piston extender (3 stages). Arm along +x at y=0, z=0; tip travels 3 blocks.
 *   P1 (0)  P2 (1)  P3 (2)  X (3)   ->   lever ON: P1, then P2, then P3 extend; X ends at x=6.
 * Return (lever OFF): P3, P2 retract; P3 pulses (pulls X 1), P1 retracts (pulls P2 home), P2 pulses (pulls P3 home),
 * P3 pulses again (pulls X home). See knowledge/LEARNINGS.md.
 *
 * Controller (no observers, no torches): every piston tap is a stone beside the arm with dust on top, fed by a lane of
 * dust from delayed copies of the lever signal L (chains of repeaters). Pulses are comparators in SUBTRACT mode
 * (rear = L delayed more, side = L delayed less): output only between the two falling edges.
 * Taps (arm cell -> side): x0 N: P1 | x1 S: pulse P2 | x2 N: P2 + pulse P3 | x3 S: pulse P3 | x4 N: P3
 * Rules that bit us: two dust wires side by side MERGE; repeater chains packed side by side do not interact.
 */
import type { World } from '../src/world.ts';
import type { Dir, Pos } from '../src/dirs.ts';

export interface Flat3Timing {
  /** all values in repeater ticks (rt, 2 game ticks) after the lever changes */
  w1Off: number; w2On: number; w2Off: number; w3: number;
  p1: [number, number]; p2: [number, number]; p3: [number, number]; // [start, end] of each pulse
}
export const FLAT3_TIMING: Flat3Timing = {
  w1Off: 13, w2On: 3, w2Off: 9, w3: 6, p1: [12, 14], p2: [17, 19], p3: [20, 22],
};

/** split a delay into repeater settings of 1..4 */
export const segs = (total: number): number[] => {
  if (total < 1) throw new Error(`delay ${total} < 1`);
  const out: number[] = [];
  let left = total;
  while (left > 0) { const d = Math.min(4, left); out.push(d); left -= d; }
  return out;
};

export function buildFlatArm3(w: World, t: Flat3Timing = FLAT3_TIMING, busRepeaterEvery = 11): { lever: Pos; tipX: Pos } {
  const placed = new Set<string>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const floor = (x: number, z: number) => { const k = key(x, 0, z); if (!placed.has(k)) { w.place([x, 0, z], 'obsidian'); placed.add(k); } };
  const wire = (x: number, z: number) => { floor(x, z); w.place([x, 1, z], 'redstone_wire'); };
  const rep = (x: number, z: number, facing: Dir, delay: number) => { floor(x, z); w.place([x, 1, z], 'repeater', { facing, delay }); };
  const cmp = (x: number, z: number, facing: Dir) => { floor(x, z); w.place([x, 1, z], 'comparator', { facing, mode: 'subtract' }); };

  // ---- the arm ----
  w.place([0, 0, 0], 'sticky_piston', { facing: 'east' });
  w.place([1, 0, 0], 'sticky_piston', { facing: 'east' });
  w.place([2, 0, 0], 'sticky_piston', { facing: 'east' });
  w.place([3, 0, 0], 'stone');

  // ---- taps: stone beside the arm with dust on top ----
  for (const x of [0, 2, 4]) { w.place([x, 0, -1], 'obsidian'); placed.add(key(x, 0, -1)); }
  for (const x of [1, 3]) { w.place([x, 0, 1], 'obsidian'); placed.add(key(x, 0, 1)); }

  // ---- buses: west bus x=-6 (north branch to z=-17, south to z=11), east bus x=10 ----
  // L enters at the lever (-6,1,0). busDelay(z) = repeaters between the lever and a consumer, to subtract from its chain.
  const west: { z: number; rep: boolean }[] = [];
  const busWest = (zFrom: number, zTo: number) => {
    const step = zTo > zFrom ? 1 : -1;
    let n = 0;
    for (let z = zFrom; z !== zTo + step; z += step) {
      n++;
      if (n % busRepeaterEvery === 0) { rep(-6, z, step < 0 ? 'south' : 'north', 1); west.push({ z, rep: true }); }
      else { wire(-6, z); west.push({ z, rep: false }); }
    }
  };
  floor(-6, 0); w.place([-6, 1, 0], 'lever', { face: 'floor' });
  busWest(-1, -17); busWest(1, 11);
  const offsetNorth = (z: number) => west.filter((c) => c.rep && c.z > z && c.z < 0).length; // repeaters between lever and z (north branch)
  const offsetSouth = (z: number) => west.filter((c) => c.rep && c.z < z && c.z > 0).length;
  return { lever: [-6, 1, 0], tipX: [3, 0, 0] };
  void offsetNorth; void offsetSouth; void cmp; void t;
}
