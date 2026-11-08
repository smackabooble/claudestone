/**
 * BUTTON -> 3 EVEN PULSES, very compact (8 x 2 blocks, 1 layer, no floor: wool only under the parts that need support).
 * An observer watching the button gives a 2 gt pulse on PRESS (t=0) and on RELEASE (t=20 gt; the stone button holds 20 gt).
 * The pulse powers block B. Lane 1: dust beside B (0 gt). Lane 2: repeaters 4+4+2 = 10 rt = 20 gt, fed from B's other side (so lane 2's output
 * can never loop back into its own input). Both lanes meet on one dust row, so the delayed press lands exactly on the release: 0, 20, 40 gt.
 * One final delay-4 repeater stretches every pulse to 8 gt (a repeater stretches a short pulse to its delay), so all 3 are equal.
 * Colours: button block purple, B orange, delay repeaters lime, dust yellow, output repeater red. Simulated only, not checked in the real game.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';

export function buildTriplePulse(w: World, delays: number[] = [4, 4, 2]): { button: [number, number, number]; out: [number, number, number] } {
  const Y = 1;
  const wool = (x: number, z: number, c: string) => w.setRaw([x, Y - 1, z], c);
  const dust = (x: number, z: number) => { wool(x, z, 'yellow_wool'); w.setRaw([x, Y, z], 'redstone_wire'); };
  w.setRaw([-1, Y, 0], 'purple_wool');                                                         // button block
  w.setRaw([0, Y, 0], 'stone_button', { face: 'wall', facing: 'east', powered: false });
  w.setRaw([1, Y, 0], 'observer', { facing: 'west', powered: false });                         // looks at the button, outputs east into B
  w.setRaw([2, Y, 0], 'orange_wool');                                                          // B
  delays.forEach((d, i) => { wool(3 + i, 0, 'lime_wool'); w.setRaw([3 + i, Y, 0], 'repeater', { facing: 'west', delay: d, powered: false }); });
  const XE = 3 + delays.length;                                                                // end of lane 2
  dust(XE, 0);
  for (let x = 2; x <= XE; x++) dust(x, 1);                                                    // shared dust row (starts beside B = lane 1)
  wool(1, 1, 'red_wool'); w.setRaw([1, Y, 1], 'repeater', { facing: 'east', delay: 4, powered: false });   // output repeater (input east, output west)
  return { button: [0, Y, 0], out: [1, Y, 1] };   // out = the output repeater; it powers whatever you put at (0,1) (no dust there: dust beside the button would pick up the button itself)
}

export const buildQuadPulse = (w: World) => buildTriplePulse(w, [4, 4, 4, 4, 4]);   // lane 2 delayed 40 gt: 0, 20 (press, release) + 40, 60 = 4 even pulses

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World(); buildTriplePulse(w); w.run(10);
  writeFileSync('examples/triple-pulse.schem', exportSchem(w).buffer);
  const w4 = new World(); buildQuadPulse(w4); w4.run(10);
  writeFileSync('examples/quad-pulse.schem', exportSchem(w4).buffer);
}
