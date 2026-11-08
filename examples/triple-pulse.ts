/**
 * BUTTON -> 3 EVEN PULSES, compact, no floor (wool only under the parts that need support).
 * An observer watching the button gives a 2 gt pulse on PRESS (t=0) and on RELEASE (t=20 gt, the stone button holds 20 gt). Lane 1 passes both through one
 * delay-4 repeater (a repeater stretches a short pulse to its delay: 8 gt wide); lane 2 delays a copy by exactly 20 gt (4+4+4+2 rt minus the 4 rt of lane 1)
 * so the delayed press lands on the release. Out: 3 pulses, each 8 gt wide, exactly 20 gt (1 s) apart (sim: on at 9, 29, 49).
 * Colours: button block purple, observer side orange, delay repeaters lime, return dust yellow. Simulated only, not checked in the real game.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';

export function buildTriplePulse(w: World, delays: number[] = [4, 4, 4, 2]): { button: [number, number, number]; out: [number, number, number] } {
  const Y = 1;
  const wool = (x: number, z: number, c: string) => w.setRaw([x, Y - 1, z], c);
  w.setRaw([1, Y, 0], 'purple_wool');                                                         // button block
  w.setRaw([0, Y, 0], 'stone_button', { face: 'wall', facing: 'west', powered: false });
  w.setRaw([0, Y, 1], 'observer', { facing: 'north', powered: false });                       // looks at the button, outputs south into B1
  w.setRaw([0, Y, 2], 'orange_wool');                                                         // B1: powered by the observer, feeds both lanes
  wool(0, 3, 'orange_wool'); w.setRaw([0, Y, 3], 'repeater', { facing: 'north', delay: 4, powered: false });   // direct lane (also a diode: nothing flows back into B1)
  delays.forEach((d, i) => { wool(1 + i, 2, 'lime_wool'); w.setRaw([1 + i, Y, 2], 'repeater', { facing: 'west', delay: d, powered: false }); });   // delay lane 11 rt
  const XE = delays.length + 1;
  for (const [x, z] of [[XE, 2], [XE, 3]]) { wool(x, z, 'yellow_wool'); w.setRaw([x, Y, z], 'redstone_wire'); }
  for (let x = 0; x <= XE; x++) { wool(x, 4, 'yellow_wool'); w.setRaw([x, Y, 4], 'redstone_wire'); }   // merge row
  return { button: [0, Y, 0], out: [XE, Y, 4] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World(); buildTriplePulse(w); w.run(10);   // settle: dust connection shapes are only computed on update
  writeFileSync('examples/triple-pulse.schem', exportSchem(w).buffer);
}
