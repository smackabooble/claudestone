/**
 * D LATCH from a locked repeater (building block of the LFSR shift register). Sim AND real Minecraft 26.3 verified (2026-11-14).
 * M = data repeater (input from the west lever D, delay 1). The LOCK repeater north of it points INTO M's side (repeater `facing` = INPUT side, so facing north = input
 * from the north lever G, output south into M). G on = locked = M holds its current state whatever D does; G off = transparent.
 * Colours: D lime, M orange, lock red, G purple, floor light gray (wool only under parts that need it).
 */
import { World } from '../src/world.ts';
export function buildLatch(w: World) {
  const Y = 1, put = (x: number, z: number, t: string, p: any = {}, c = 'light_gray_wool') => { w.setRaw([x, Y - 1, z], c); w.setRaw([x, Y, z], t, p); };
  put(0, 0, 'lever', { face: 'floor', facing: 'north', powered: false }, 'lime_wool');
  put(1, 0, 'repeater', { facing: 'west', delay: 1, powered: false }, 'orange_wool');
  put(1, -1, 'repeater', { facing: 'north', delay: 1, powered: false }, 'red_wool');
  put(1, -2, 'lever', { face: 'floor', facing: 'north', powered: false }, 'purple_wool');
  return { D: [0, Y, 0] as [number, number, number], G: [1, Y, -2] as [number, number, number], M: [1, Y, 0] as [number, number, number] };
}
