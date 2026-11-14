/**
 * XOR GATE, one layer, no floor (wool only under the parts that need support). Two subtract comparators facing away from each other:
 *   C1 = A - B (rear: A net, side: B net)     C2 = B - A (rear: B net, side: A net)
 * Both outputs go into the SAME dust cell between them: out = (A-B) or (B-A) = A xor B. The A net and the B net are routed around the comparators so
 * each comparator sees A only on its A side and B only on its B side (a net on both sides would make it 0); a repeater in each long run keeps the side input at 15 (weak side signal leaks: A-B would not reach 0). Levers only touch their own net; levers are
 * never used as a comparator side input (only dust is). Colours: A net lime, B net light blue, comparators magenta, output yellow.
 * Simulated only, not checked in the real game.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';

export function buildXor(w: World): { a: [number, number, number]; b: [number, number, number]; out: [number, number, number] } {
  const Y = 1;
  const wool = (x: number, z: number, c: string) => w.setRaw([x, Y - 1, z], c);
  const dust = (x: number, z: number, c: string) => { wool(x, z, c); w.setRaw([x, Y, z], 'redstone_wire'); };
  const lever = (x: number, z: number, c: string) => { wool(x, z, c); w.setRaw([x, Y, z], 'lever', { face: 'floor', facing: 'north', powered: false }); };
  lever(-1, 1, 'lime_wool'); lever(5, 1, 'light_blue_wool');
  // A net: lever -> (0,1) = C1 rear; around the north side -> repeater (3,0) pointing into C2's side (a repeater gives a full 15 side input; dust at the end of a long run would leak)
  for (const [x, z] of [[0, 1], [0, 0], [0, -1], [1, -1], [2, -1], [3, -1]]) dust(x, z, 'lime_wool');
  wool(3, 0, 'lime_wool'); w.setRaw([3, Y, 0], 'repeater', { facing: 'north', delay: 1, powered: false });
  // B net: lever -> (4,1) = C2 rear; around the south side -> repeater (1,2) pointing into C1's side
  for (const [x, z] of [[4, 1], [4, 2], [4, 3], [3, 3], [2, 3], [1, 3]]) dust(x, z, 'light_blue_wool');
  wool(1, 2, 'light_blue_wool'); w.setRaw([1, Y, 2], 'repeater', { facing: 'south', delay: 1, powered: false });
  wool(1, 1, 'magenta_wool'); w.setRaw([1, Y, 1], 'comparator', { facing: 'west', mode: 'subtract', powered: false });   // C1: rear west, output east
  wool(3, 1, 'magenta_wool'); w.setRaw([3, Y, 1], 'comparator', { facing: 'east', mode: 'subtract', powered: false });   // C2: rear east, output west
  dust(2, 1, 'yellow_wool');                                                                                           // both outputs meet here
  return { a: [-1, Y, 1], b: [5, Y, 1], out: [2, Y, 1] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World(); buildXor(w); w.run(10);
  writeFileSync('examples/xor-gate.schem', exportSchem(w).buffer);
}
