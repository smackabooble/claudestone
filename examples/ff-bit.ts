/**
 * ONE FLIP-FLOP BIT on a two-phase pulse clock (test bed for the LFSR). Every flip of the STEP lever = one step: phi1 opens the master latch, 24 gt later phi2 opens the slave latch.
 * Latch = data repeater + lock repeater pointing into its side (see rep-latch.ts); lock = NOT phi (torch on the wool block that the phi repeater powers).
 * Layout (x east, z south, y=1): row z=0: D lever (-1) - dust (0) - M (1) - dust (2) - S (3) - dust Q (4). North bus z=-2 = NOT phi1 (lock of M), south bus z=2 = NOT phi2 (lock of S).
 * Clock at x=10: STEP lever (12,0), observer (11,0) watches it, B0 wool (10,0) gets its pulse; phi1 = repeater (10,-1); phi2 = three delay-4 repeaters (10,1..3) -> B2 (10,4).
 */
import { World } from '../src/world.ts';
type P3 = [number, number, number];
export function buildFF(w: World) {
  const Y = 1;
  const wool = (x: number, z: number, c: string) => w.setRaw([x, Y - 1, z], c);
  const put = (x: number, z: number, t: string, p: any = {}, c = 'light_gray_wool') => { wool(x, z, c); w.setRaw([x, Y, z], t, p); };
  const dust = (x: number, z: number, c = 'yellow_wool') => put(x, z, 'redstone_wire', {}, c);
  const rep = (x: number, z: number, facing: string, delay: number, c: string) => put(x, z, 'repeater', { facing, delay, powered: false }, c);
  const blk = (x: number, z: number, c: string) => { wool(x, z, 'light_gray_wool'); w.setRaw([x, Y, z], c); };
  // data row
  put(-1, 0, 'lever', { face: 'floor', facing: 'north', powered: false }, 'lime_wool');
  dust(0, 0); rep(1, 0, 'west', 1, 'orange_wool'); dust(2, 0); rep(3, 0, 'west', 1, 'orange_wool'); dust(4, 0);
  // locks: M's lock north (input from the north bus), S's lock south (input from the south bus); facing = INPUT side
  rep(1, -1, 'north', 1, 'red_wool'); rep(3, 1, 'south', 1, 'red_wool');
  // north bus z=-2 (NOT phi1), from the torch at x=9 west to x=1
  for (let x = 1; x <= 8; x++) dust(x, -2, 'pink_wool');
  // south bus: from the torch (9,4) dust (8,4) -> (8,3) -> (8,2) -> west along z=2 to x=3
  dust(8, 4, 'light_blue_wool'); dust(8, 3, 'light_blue_wool'); for (let x = 3; x <= 8; x++) dust(x, 2, 'light_blue_wool');
  // clock
  put(12, 0, 'lever', { face: 'floor', facing: 'north', powered: false }, 'purple_wool');                       // STEP
  w.setRaw([11, Y, 0], 'observer', { facing: 'east', powered: false });                                         // looks at STEP, outputs west into B0
  wool(10, 0, 'magenta_wool'); w.setRaw([10, Y, 0], 'magenta_wool');                                            // B0
  rep(10, -1, 'south', 4, 'green_wool');                                                                         // phi1: input from B0 (south), output north into B1
  wool(10, -2, 'magenta_wool'); w.setRaw([10, Y, -2], 'cyan_wool');                                              // B1
  w.setRaw([9, Y, -2], 'redstone_wall_torch', { facing: 'west', lit: true });                                    // NOT phi1 -> dust (8,-2)
  rep(10, 1, 'north', 4, 'green_wool'); rep(10, 2, 'north', 4, 'green_wool'); rep(10, 3, 'north', 4, 'green_wool');   // phi2 = phi1 source delayed 24 gt (input from the north, output south)
  wool(10, 4, 'magenta_wool'); w.setRaw([10, Y, 4], 'cyan_wool');                                                // B2
  w.setRaw([9, Y, 4], 'redstone_wall_torch', { facing: 'west', lit: true });                                     // NOT phi2 -> dust (8,4)
  return { D: [-1, Y, 0] as P3, STEP: [12, Y, 0] as P3, M: [1, Y, 0] as P3, S: [3, Y, 0] as P3 };
}
