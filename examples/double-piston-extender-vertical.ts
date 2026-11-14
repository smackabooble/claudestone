/**
 * Upright double piston extender. Run: npx tsx examples/double-piston-extender-vertical.ts
 *
 * Arm along +y at x=0, z=0:   A (sticky) y=0,  B (sticky) y=1,  tip block X y=2.
 *   Lever ON : tip rises from y=2 to y=4.   Lever OFF: tip comes back down.
 * Same logic as the flat version (see double-piston-extender.ts), but power is delivered by
 * repeaters that point into the arm from the side, since dust cannot run up a wall:
 *   - A: repeater south of it (y=0), fed by an OR of a fast and a slow path
 *   - B up (y=2): repeater east of it, fed through a dust staircase + a delay repeater
 *   - B home (y=1): repeater west of it, fed by an observer that watches A
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { bounds, render, LEGEND } from '../src/view.ts';
import type { Dir, Pos } from '../src/dirs.ts';

export interface Delays { fast: number; slow: number; b: number }
/** `slow` = total repeater ticks of the two-repeater slow path (2..8). */
export const DEFAULT_DELAYS: Delays = { fast: 1, slow: 6, b: 4 };

export function buildUpright(w: World, d: Delays = DEFAULT_DELAYS): { lever: Pos } {
  const stone = (x: number, y: number, z: number) => w.place([x, y, z], 'stone');
  const wire = (x: number, y: number, z: number) => w.place([x, y, z], 'redstone_wire');
  const rep = (x: number, y: number, z: number, facing: Dir, delay: number) =>
    w.place([x, y, z], 'repeater', { facing, delay });

  // floor under the y=0 circuit (south side), and the supports for everything else
  for (const [x, z] of [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 5], [2, 5], [2, 4], [2, 3], [2, 2]]) stone(x, -1, z);
  stone(2, 0, 1); stone(2, 1, 0);          // dust staircase up to y=2
  stone(1, 1, 0);                          // support of the repeater that feeds B at y=2
  stone(-1, 0, 0);                         // support of the repeater that feeds B at y=1
  for (const [x, z] of [[0, -2], [-1, -2], [-2, -2], [-2, -1], [-2, 0]]) stone(x, 0, z); // pulse route

  // the arm
  w.place([0, 0, 0], 'sticky_piston', { facing: 'up' });
  w.place([0, 1, 0], 'sticky_piston', { facing: 'up' });
  w.place([0, 2, 0], 'stone'); // tip block X
  w.place([0, 0, -1], 'observer', { facing: 'south' }); // watches A

  // A's power: J = OR(fast, slow) -> repeater into A
  wire(0, 0, 2);                       // J
  rep(0, 0, 1, 'south', 1);            // into A
  rep(1, 0, 2, 'east', d.fast);        // fast path into J
  // slow path into J: two repeaters in series (each is 1..4 repeater ticks), fed straight from the lever
  rep(0, 0, 4, 'south', Math.ceil(d.slow / 2));
  rep(0, 0, 3, 'south', Math.floor(d.slow / 2));
  wire(1, 0, 5); wire(2, 0, 5); wire(2, 0, 4); wire(2, 0, 3); wire(2, 0, 2); // bus
  w.place([0, 0, 5], 'lever', { face: 'floor' });

  // B's power at y=2: staircase up, then delay repeater into B
  wire(2, 1, 1); wire(2, 2, 0);
  rep(1, 2, 0, 'east', d.b);

  // B's pulse at y=1: observer back-output -> dust -> repeater into B
  wire(0, 1, -2); wire(-1, 1, -2); wire(-2, 1, -2); wire(-2, 1, -1); wire(-2, 1, 0);
  rep(-1, 1, 0, 'west', 1);
  return { lever: [0, 0, 5] };
}

export function tipY(w: World): number | null {
  for (let y = -1; y <= 7; y++) if (w.get([0, y, 0]).type === 'stone') return y;
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World();
  const { lever } = buildUpright(w);
  w.run(40);
  console.log('rest: tip y =', tipY(w));
  w.use(lever); w.run(40);
  console.log('ON : tip y =', tipY(w));
  w.use(lever); w.run(60);
  console.log('OFF: tip y =', tipY(w));
  const bb = bounds(w)!;
  console.log(`${render(w, bb.min, bb.max)}\n${LEGEND}`);
  writeFileSync('examples/double-piston-extender-vertical.schem', exportSchem(w).buffer);
}
