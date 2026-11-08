/**
 * BUTTON -> 3 PULSES, compact, no floor (wool only under the parts that need support).
 * An observer watching the button gives a 2 gt pulse on PRESS (t=0) and another on RELEASE (t=20 gt). A copy of both pulses is delayed 20 gt
 * (delay 4+4+3 vs 1 = 10 rt) and merged back: pulses at 0, 20 (the delayed press and the release coincide) and 40 gt. Colours: button block purple,
 * observer-side dust orange, delay repeaters lime, return dust yellow. Simulated only, not checked in the real game.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';

export function buildTriplePulse(w: World): { button: [number, number, number]; out: [number, number, number] } {
  const Y = 1;
  const wool = (x: number, z: number, c: string) => w.setRaw([x, Y - 1, z], c);
  w.setRaw([1, Y, 0], 'purple_wool');                                                         // button block
  w.setRaw([0, Y, 0], 'stone_button', { face: 'wall', facing: 'west', powered: false });
  w.setRaw([0, Y, 1], 'observer', { facing: 'north', powered: false });                       // looks at the button, outputs south into B1
  w.setRaw([0, Y, 2], 'orange_wool');                                                         // B1: powered by the observer, feeds both lanes
  wool(0, 3, 'orange_wool'); w.setRaw([0, Y, 3], 'repeater', { facing: 'north', delay: 1, powered: false });   // direct lane (also a diode: nothing flows back into B1)
  [4, 4, 3].forEach((d, i) => { wool(1 + i, 2, 'lime_wool'); w.setRaw([1 + i, Y, 2], 'repeater', { facing: 'west', delay: d, powered: false }); });   // delay lane 11 rt
  for (const [x, z] of [[4, 2], [4, 3]]) { wool(x, z, 'yellow_wool'); w.setRaw([x, Y, z], 'redstone_wire'); }
  for (let x = 0; x <= 4; x++) { wool(x, 4, 'yellow_wool'); w.setRaw([x, Y, 4], 'redstone_wire'); }   // merge row
  return { button: [0, Y, 0], out: [4, Y, 4] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World(); buildTriplePulse(w); w.run(10);   // settle: dust connection shapes are only computed on update
  writeFileSync('examples/triple-pulse.schem', exportSchem(w).buffer);
}
