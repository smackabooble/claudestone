/**
 * One-lever micro test for COPPER BULBS in the real game. Run: npx tsx examples/microtests/copper-bulb.ts
 * Bus along z=2 from the lever at the west end; five copies (x = 6, 14, 22, 30, 38), each a bulb with a comparator reading it
 * (the comparator output dust shows 0/15). Flip the lever ON, wait, OFF, wait, ON, OFF, ON, OFF (trace with /doortrace).
 *   A  dust ends against the bulb (direct)
 *   B  repeater powers the bulb
 *   C  observer watching the bus dust pulses the bulb (one short pulse on ON and one on OFF)
 *   D  two repeaters (delay 1 and delay 4) power the same bulb from different sides, overlapping
 *   E  sticky piston pushes the bulb next to a redstone block (bulb arrives already powered), retracts on OFF
 * Sim (my guess, to be checked): the bulb flips lit on every rising edge of power, never on a falling edge, instantly.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../../src/world.ts';
import { exportSchem } from '../../src/export.ts';
import type { Pos } from '../../src/dirs.ts';

export const LEVER: Pos = [-1, 2, 2];
const OX = [6, 14, 22, 30, 38];
export const BULBS: Pos[] = [[6, 2, 0], [14, 2, -1], [22, 2, -1], [30, 2, 0], [38, 2, -2]];

export function buildBulbTest(w: World): void {
  for (let x = -3; x <= 44; x++) for (let z = -5; z <= 4; z++) w.place([x, 1, z], 'obsidian');
  w.place([-2, 2, 2], 'obsidian'); w.place(LEVER, 'lever', { face: 'wall', facing: 'east' });
  for (let x = 0; x <= 44; x++) {
    if (x % 8 === 3) w.place([x, 2, 2], 'repeater', { facing: 'west', delay: 1 }); // flows east
    else w.place([x, 2, 2], 'redstone_wire');
  }
  const cmpOut = (bulb: Pos, side: 'west' | 'east' | 'north' | 'south') => { // comparator reading the bulb, one dust cell behind it
    const d = { west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1] }[side];
    const cp: Pos = [bulb[0] + d[0], bulb[1], bulb[2] + d[1]];
    const out = { west: 'east', east: 'west', north: 'south', south: 'north' }[side] as 'west';
    void out; // comparator facing = input side: it reads the bulb which lies the opposite way
    const opp = { west: 'east', east: 'west', north: 'south', south: 'north' }[side];
    w.place(cp, 'comparator', { facing: opp });
    w.place([cp[0] + d[0], cp[1], cp[2] + d[1]], 'redstone_wire');
  };
  // A
  w.place([6, 2, 1], 'redstone_wire'); w.place([6, 2, 0], 'copper_bulb'); cmpOut([6, 2, 0], 'east');
  // B
  w.place([14, 2, 1], 'redstone_wire'); w.place([14, 2, 0], 'repeater', { facing: 'south', delay: 1 });
  w.place([14, 2, -1], 'copper_bulb'); cmpOut([14, 2, -1], 'east');
  // C
  w.place([22, 2, 0], 'observer', { facing: 'south' }); w.place([22, 2, 1], 'redstone_wire');
  w.place([22, 2, -1], 'copper_bulb'); cmpOut([22, 2, -1], 'east');
  // D
  w.place([30, 2, 0], 'copper_bulb');
  w.place([30, 2, 1], 'repeater', { facing: 'south', delay: 1 });
  w.place([32, 2, 1], 'redstone_wire'); w.place([32, 2, 0], 'redstone_wire'); w.place([31, 2, 0], 'repeater', { facing: 'east', delay: 4 });
  cmpOut([30, 2, 0], 'north');
  // E
  w.place([38, 2, 1], 'redstone_wire'); w.place([38, 2, 0], 'sticky_piston', { facing: 'north' });
  w.place([38, 2, -1], 'obsidian'); w.remove([38, 2, -1]);
  w.place([38, 2, -3], 'redstone_block');
  w.place([38, 2, -1], 'copper_bulb');
  cmpOut([38, 2, -2], 'east');
}

/** the observer of copy C pulses once while the build settles; reset that bulb so the schematic starts unlit */
export function settleBulbTest(w: World): void { w.run(40); w.setRaw([22, 2, -1], 'copper_bulb', { lit: false, powered: false }); w.run(10); }

if (process.argv[1]?.endsWith('copper-bulb.ts')) {
  const w = new World(); buildBulbTest(w); settleBulbTest(w);
  const show = () => BULBS.map((p, i) => { const b = w.get(p); return `${'ABCDE'[i]}:${b.type === 'copper_bulb' ? (b.p.lit ? 'LIT' : 'off') + (b.p.powered ? '*' : ' ') : b.type}`; }).join('  ');
  console.log('start', show());
  for (let i = 0; i < 6; i++) { w.use(LEVER); w.run(40); console.log(w.get(LEVER).p.powered ? 'ON  ' : 'OFF ', show()); }
  const f = new World(); buildBulbTest(f); settleBulbTest(f);
  const out = exportSchem(f);
  writeFileSync('examples/microtests/copper-bulb.schem', out.buffer);
  console.log('wrote copper-bulb.schem', out.size.join('x'));
}
