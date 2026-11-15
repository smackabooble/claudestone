/**
 * LAMP SCREEN, 3x3-lamp pixels (W x H pixels -> 3W x 3H lamps). Lamp plane z=0, viewer at z<0. Phase 2a: the lamp stage only.
 * Per lamp column (x = 3px+c), three lamp rows r0,r1,r2 (y = 3py+r). Two feed chains per column:
 *  r0 (chain P, lamp r0):  z1 lime wool (strongly powered), z2 repeater, z3 magenta wool, z4 repeater, z5 redstone torch (inverts), z6 INPUT block P.
 *  r1 (chain T, lamps r1+r2): z1 wall torch (lights its lamp and strongly powers the wool above = lamp r2), z2 yellow wool, z3 repeater, z4 INPUT block T.
 *  r2: z1 lime wool (powered by the torch below), z2 and z4 gray wool = solid support for the NEXT pixel row's r0 repeaters (z2,z4).
 * Both chains invert once, so input block powered = pixel OFF. 6 input blocks per pixel (P and T for each of 3 columns): phase 2b fans one memory output out to them.
 * No lamp is ever strongly powered (that would bleed to neighbours); repeaters never sit on a repeater (support checked by canSurvive).
 * Skirt row y=-1 (black wool) under row 0's z2/z4 repeater supports.
 */
import { World } from '../src/world.ts';
type P3 = [number, number, number];
export interface Screen3 { W: number; H: number; pixelLamps: (px: number, py: number) => P3[]; inputs: (px: number, py: number) => P3[] }
export function buildScreen3(w: World, W = 10, H = 10): Screen3 {
  const s = (x: number, y: number, z: number, t: string, p: Record<string, any> = {}) => w.setRaw([x, y, z], t, p);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) for (let c = 0; c < 3; c++) {
    const x = 3 * px + c, y = 3 * py;
    for (let r = 0; r < 3; r++) s(x, y + r, 0, 'redstone_lamp', { lit: false });
    s(x, y, 1, 'lime_wool'); s(x, y, 2, 'repeater', { facing: 'south', delay: 1, powered: false }); s(x, y, 3, 'magenta_wool');
    s(x, y, 4, 'repeater', { facing: 'south', delay: 1, powered: false }); s(x, y, 5, 'redstone_wall_torch', { lit: true, facing: 'north' }); s(x, y, 6, 'purple_wool');
    s(x, y + 1, 1, 'redstone_wall_torch', { lit: true, facing: 'north' }); s(x, y + 1, 2, 'yellow_wool');
    s(x, y + 1, 3, 'repeater', { facing: 'south', delay: 1, powered: false }); s(x, y + 1, 4, 'orange_wool');
    s(x, y + 2, 1, 'lime_wool'); s(x, y + 2, 2, 'gray_wool'); s(x, y + 2, 4, 'gray_wool');
  }
  for (let x = 0; x < 3 * W; x++) { s(x, -1, 2, 'black_wool'); s(x, -1, 4, 'black_wool'); }
  return {
    W, H,
    pixelLamps: (px, py) => { const l: P3[] = []; for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) l.push([3 * px + c, 3 * py + r, 0]); return l; },
    inputs: (px, py) => { const l: P3[] = []; for (let c = 0; c < 3; c++) { l.push([3 * px + c, 3 * py, 6]); l.push([3 * px + c, 3 * py + 1, 4]); } return l; },
  };
}
