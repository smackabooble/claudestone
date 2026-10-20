/**
 * 2x2 sticky-piston door. Run: npx tsx examples/piston-door-2x2.ts
 *
 * Layout (wall plane z=0, door cells x=0..1, y=1..2; you walk through along z):
 *   - 2 sticky pistons below (facing up) and 2 above (facing down) pull the door blocks out of the doorway
 *   - lever ON = open, OFF = closed (a redstone torch inverts the lever)
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { bounds, render, LEGEND } from '../src/view.ts';
import type { Pos } from '../src/dirs.ts';

export function buildDoor(w: World): { lever: Pos; door: Pos[] } {
  const stone = (x: number, y: number, z: number) => w.place([x, y, z], 'stone');

  // wall plane z=0, x=-2..3, y=-2..6 (leaving holes for door, pistons, heads and the top wires)
  const hole = new Set<string>();
  for (const x of [0, 1]) for (const y of [-1, 0, 1, 2, 3, 4]) hole.add(`${x},${y}`);
  for (let y = -2; y <= 6; y++) for (let x = -2; x <= 3; x++) if (!hole.has(`${x},${y}`)) stone(x, y, 0);

  // lower power line: stone blocks behind the lower pistons, dust on top of them
  for (const x of [0, 1, 2]) stone(x, -1, 1);
  // upper power line: stone blocks behind the upper pistons, dust on top of them
  for (const x of [0, 1]) stone(x, 4, 1);
  // staircase supports for the dust ladder up to the upper line
  stone(2, 0, 2); stone(3, 1, 2); stone(3, 2, 1); stone(2, 3, 1);
  // torch support block (lever goes on top of it)
  stone(5, 2, 2);

  // pistons (placed retracted; the torch powers them and they extend, closing the door)
  for (const x of [0, 1]) {
    w.place([x, -1, 0], 'sticky_piston', { facing: 'up' });
    w.place([x, 4, 0], 'sticky_piston', { facing: 'down' });
  }
  // the door itself
  const door: Pos[] = [[0, 1, 0], [1, 1, 0], [0, 2, 0], [1, 2, 0]];
  for (const d of door) w.place(d, 'stone');

  // redstone: lower line, ladder, upper line
  for (const x of [0, 1, 2]) w.place([x, 0, 1], 'redstone_wire');
  w.place([2, 1, 2], 'redstone_wire');
  w.place([3, 2, 2], 'redstone_wire');
  w.place([3, 3, 1], 'redstone_wire');
  w.place([2, 4, 1], 'redstone_wire');
  for (const x of [1, 0]) w.place([x, 5, 1], 'redstone_wire');

  // power: always-on torch; the lever powers its support block and turns it off
  w.place([4, 2, 2], 'redstone_wall_torch', { facing: 'west' });
  w.place([5, 3, 2], 'lever', { face: 'floor' });
  return { lever: [5, 3, 2], door };
}

const isClosed = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'stone');
const isOpen = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'air');

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World();
  const { lever, door } = buildDoor(w);
  w.run(40);
  console.log('closed after settling:', isClosed(w, door));
  w.use(lever);
  let t = 0;
  while (!isOpen(w, door) && t < 60) { w.step(); t++; }
  console.log(`lever ON  -> open after ${t} ticks:`, isOpen(w, door));
  w.run(30);
  w.use(lever);
  t = 0;
  while (!isClosed(w, door) && t < 60) { w.step(); t++; }
  console.log(`lever OFF -> closed after ${t} ticks:`, isClosed(w, door));
  w.run(30);
  console.log('stable closed:', isClosed(w, door));

  const bb = bounds(w)!;
  console.log(`${render(w, bb.min, bb.max)}\n${LEGEND}`);
  const out = exportSchem(w);
  writeFileSync('examples/piston-door-2x2.schem', out.buffer);
  console.log('exported size', out.size.join('x'), 'bytes', out.buffer.length);
}
