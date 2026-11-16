/**
 * Double piston extender (DPE). Run: npx tsx examples/double-piston-extender.ts
 *
 * Arm along +x at y=0, z=0:   A (sticky) at x=0,  B (sticky) at x=1,  tip block X at x=2.
 *   Lever ON : A extends, pushing B forward; B then extends; X travels 2 blocks (x=2 -> x=4).
 *   Lever OFF: B retracts (X -> 3), A retracts (pulls B home), then an observer pulses B once more
 *              (extend + retract) so B pulls X the last block home (x=2).
 * Timing trick: repeaters give A "instant on, late off" (two parallel paths into one dust node) and
 * B "late on", because B must not move before A has pushed it, and A must not pull before B has settled.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { bounds, render, LEGEND } from '../src/view.ts';
import type { Dir, Pos } from '../src/dirs.ts';

export interface Delays { fast: number; slow: number; b: number }
export const DEFAULT_DELAYS: Delays = { fast: 1, slow: 4, b: 2 };

export function buildExtender(w: World, d: Delays = DEFAULT_DELAYS): { lever: Pos; tip: (x: number) => Pos } {
  const stone = (x: number, y: number, z: number) => w.place([x, y, z], 'stone');
  const glass = (x: number, y: number, z: number) => w.place([x, y, z], 'glass');
  const wire = (x: number, y: number, z: number) => w.place([x, y, z], 'redstone_wire');
  const rep = (x: number, y: number, z: number, facing: Dir, delay: number) =>
    w.place([x, y, z], 'repeater', { facing, delay });

  // supports first (glass next to the arm so it is not powered through the stone)
  for (const [x, z] of [[1, -1], [2, -1], [0, -2], [1, -2], [3, -1], [4, -1], [5, -1], [5, 0]]) stone(x, 0, z);
  for (const [x, z] of [[5, 1], [4, 1], [3, 1], [2, 1], [1, 1]]) glass(x, 0, z);
  for (const [x, z] of [[0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [2, 2], [0, 4]]) stone(x, 0, z);

  // the arm
  w.place([0, 0, 0], 'sticky_piston', { facing: 'east' });
  w.place([1, 0, 0], 'sticky_piston', { facing: 'east' });
  w.place([2, 0, 0], 'stone'); // tip block X
  w.place([0, 0, -1], 'observer', { facing: 'south' }); // watches piston A, pulses B when A has come home

  // north: B's power line (both positions of B), fed by a delayed repeater and by the observer pulse
  wire(1, 1, -1); wire(2, 1, -1);
  wire(0, 1, -2); wire(1, 1, -2);
  rep(3, 1, -1, 'east', d.b);
  wire(4, 1, -1); wire(5, 1, -1); wire(5, 1, 0);

  // south: A's power node J = OR(fast path, slow path)
  wire(0, 1, 1);                       // J
  rep(1, 1, 1, 'east', d.fast);        // fast path into J
  rep(0, 1, 2, 'south', d.slow);       // slow path into J
  wire(5, 1, 1); wire(4, 1, 1); wire(3, 1, 1); wire(2, 1, 1);
  wire(2, 1, 2); wire(2, 1, 3); wire(1, 1, 3); wire(0, 1, 3); // bus
  w.place([0, 1, 4], 'lever', { face: 'floor' });
  return { lever: [0, 1, 4], tip: (x) => [x, 0, 0] };
}

export function tipX(w: World): number | null {
  for (let x = -1; x <= 6; x++) if (w.get([x, 0, 0]).type === 'stone') return x;
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World();
  const { lever } = buildExtender(w);
  w.run(40);
  console.log('rest: tip x =', tipX(w));
  w.use(lever); w.run(40);
  console.log('ON : tip x =', tipX(w), ' A,B =', w.get([0, 0, 0]).type, w.read([0, 0, 0], 'extended'), w.read([2, 0, 0], 'extended'));
  w.use(lever); w.run(60);
  console.log('OFF: tip x =', tipX(w));
  const bb = bounds(w)!;
  console.log(`${render(w, bb.min, bb.max)}\n${LEGEND}`);
  writeFileSync('examples/double-piston-extender.schem', exportSchem(w).buffer);
}
