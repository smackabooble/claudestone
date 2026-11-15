/**
 * LAMP SCREEN phase 1: flush wall, every pixel = 2x2 lamps (W x H pixels -> 2W x 2H lamps), lamp plane z=0, viewer at z<0.
 * Pixel (bottom-left cell X,Y; top row Y+1) behind its 4 lamps:
 *  z1  bottom row: redstone TORCH (lights its lamp, strongly powers the wool above it = the top lamp)   top row: lime wool
 *  z2  bottom row: yellow wool (torch support, powered from z3)
 *  z3  bottom row: repeater (output north)   top row: gray wool (support for the next pixel's repeater)
 *  z4  cyan wool (input block, one per column)   z5  one lever per column (PHASE 1 ONLY: the 2 columns of a pixel need one shared output; fan-out from one memory cell is a phase-2 job; a dust fan-out leaks into the neighbour pixel's wool).  Torches invert: lever OFF = pixel ON (phase 2 memory fixes polarity).
 * A torch is not a conductor, so a lamp next to it does not bleed; the lime wool is strongly powered only by its own torch.
 * Row y=-1 skirt (black) under the bottom row's z3/z4-right. Lamp pixel (px,py) = lamps (2px..2px+1, 2py..2py+1).
 */
import { World } from '../src/world.ts';
type P3 = [number, number, number];
export interface Screen { W: number; H: number; pixelLamps: (px: number, py: number) => P3[]; lever: P3[][] }
export function buildScreen(w: World, W = 10, H = 10): Screen {
  const lever: P3[][] = [];
  const s = (x: number, y: number, z: number, t: string, p: Record<string, any> = {}) => w.setRaw([x, y, z], t, p);
  for (let py = 0; py < H; py++) { lever[py] = [];
    for (let px = 0; px < W; px++) {
      const X = 2 * px, Y = 2 * py;
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) s(X + dx, Y + dy, 0, 'redstone_lamp', { lit: false });
      for (let dx = 0; dx < 2; dx++) {
        s(X + dx, Y, 1, 'redstone_wall_torch', { lit: true, facing: 'north' });
        s(X + dx, Y + 1, 1, 'lime_wool');
        s(X + dx, Y, 2, 'yellow_wool');
        s(X + dx, Y, 3, 'repeater', { facing: 'south', delay: 1, powered: false });
        s(X + dx, Y + 1, 3, 'gray_wool');
      }
      for (let dx = 0; dx < 2; dx++) { s(X + dx, Y, 4, 'cyan_wool'); s(X + dx, Y, 5, 'lever', { face: 'wall', facing: 'south', powered: false }); }
      lever[py][px] = [X, Y, 5];   // [X+1,Y,5] is the second input of the same pixel
    } }
  for (let x = 0; x < 2 * W; x++) { s(x, -1, 3, 'black_wool');  }
  return { W, H, pixelLamps: (px, py) => [[2*px,2*py,0],[2*px+1,2*py,0],[2*px,2*py+1,0],[2*px+1,2*py+1,0]], lever };
}
