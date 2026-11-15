/**
 * LAMP SCREEN phase 1: W x H flush lamp wall (plane z=0, viewer at z<0). Each pixel is a 1x1 column behind its lamp:
 * z=1 empty, z=2 redstone block (orange), z=3 sticky piston facing the lamp (magenta not available: piston), z=4 wool (cyan), z=5 lever (test input).
 * Powered piston pushes its redstone block to z=1 next to the lamp = lamp on; a redstone block gives NO bleed to neighbour lamps (a repeater into a lamp does).
 * ONLY ROWS (H=1) WORK: stacked rows fail by quasi-connectivity (see LEARNINGS). Resizable: buildScreen(w, W, H). Phase 2 replaces levers by row/column memory.
 */
import { World } from '../src/world.ts';
type P3 = [number, number, number];
export interface Screen { W: number; H: number; lamp: P3[][]; lever: P3[][] }
export function buildScreen(w: World, W = 10, H = 10): Screen {
  const lamp: P3[][] = [], lever: P3[][] = [];
  for (let y = 0; y < H; y++) { lamp[y] = []; lever[y] = [];
    for (let x = 0; x < W; x++) {
      w.setRaw([x, y, 0], 'redstone_lamp', { lit: false }); lamp[y][x] = [x, y, 0];
      w.setRaw([x, y, 2], 'redstone_block', {});
      w.setRaw([x, y, 3], 'sticky_piston', { facing: 'north', extended: false });
      w.setRaw([x, y, 4], 'cyan_wool', {});
      w.setRaw([x, y, 5], 'lever', { face: 'wall', facing: 'south', powered: false }); lever[y][x] = [x, y, 5];
    } }
  return { W, H, lamp, lever };
}
