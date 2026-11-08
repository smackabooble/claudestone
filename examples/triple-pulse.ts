/**
 * BUTTON -> 3 PULSES. One stone button (20 gt = 10 rt) feeds three lanes with different delays that merge on one bus:
 * east lane 0 rt, north lane 16 rt (4 x delay-4), south lane 32 rt (8 x delay-4). Each lane repeats the full 10 rt button pulse,
 * so the lamp lights 3 times (on 10 rt, off 6 rt). Colours: button block purple, east lane red, north lime, south light blue, bus yellow, floor light gray.
 * Simulated only, not checked in the real game.
 */
import { World } from '../src/world.ts';

export function buildTriplePulse(w: World): { button: [number, number, number]; lamp: [number, number, number] } {
  const Y = 1, XM = 6;
  const put = (x: number, z: number, type: string, props: Record<string, any> = {}, y = Y) => w.setRaw([x, y, z], type, props);
  for (let x = -2; x <= XM + 2; x++) for (let z = -8; z <= 11; z++) put(x, z, 'light_gray_wool', {}, 0);
  put(0, 0, 'purple_wool');
  w.setRaw([-1, Y, 0], 'stone_button', { face: 'wall', facing: 'west', powered: false });
  const lane = (wool: string, cells: { x: number; z: number; kind: 'rep' | 'dust'; delay?: number; face?: string }[]) => {
    for (const c of cells) {
      put(c.x, c.z, 'redstone_wire'); // placeholder replaced below
      w.setRaw([c.x, Y - 1, c.z], wool);
      if (c.kind === 'rep') put(c.x, c.z, 'repeater', { facing: c.face, delay: c.delay, powered: false });
      else put(c.x, c.z, 'redstone_wire');
    }
  };
  // east lane: d1 then dust to the bus
  lane('red_wool', [{ x: 1, z: 0, kind: 'rep', delay: 1, face: 'west' }, ...[2, 3, 4, 5].map((x) => ({ x, z: 0, kind: 'dust' as const }))]);
  // north lane: d1 + 4 x d4 going north, dust east along z=-5
  const n: any[] = [{ x: 0, z: -1, kind: 'rep', delay: 1, face: 'south' }];
  for (const z of [-2, -3, -4, -5]) n.push({ x: 0, z, kind: 'rep', delay: 4, face: 'south' });
  for (let x = 0; x <= XM - 1; x++) n.push({ x, z: -6, kind: 'dust' });
  lane('lime_wool', n);
  // south lane: d1 + 8 x d4 going south, dust east along z=8
  const s: any[] = [{ x: 0, z: 1, kind: 'rep', delay: 1, face: 'north' }];
  for (const z of [2, 3, 4, 5, 6, 7, 8, 9]) s.push({ x: 0, z, kind: 'rep', delay: 4, face: 'north' });
  for (let x = 0; x <= XM - 1; x++) s.push({ x, z: 10, kind: 'dust' });
  lane('light_blue_wool', s);
  // bus along x=XM from z=-5 to z=8, lamp east of the east lane's end
  for (let z = -6; z <= 10; z++) { w.setRaw([XM, Y - 1, z], 'yellow_wool'); if (z === 8 || z === 4) put(XM, z, 'repeater', { facing: 'south', delay: 1, powered: false }); else put(XM, z, 'redstone_wire'); }   // repeaters refresh the long south run
  
  w.setRaw([XM + 1, Y - 1, 0], 'yellow_wool'); put(XM + 1, 0, 'repeater', { facing: 'west', delay: 1, powered: false });   // output repeater (dust alone would not point at the lamp)
  w.setRaw([XM + 2, Y, 0], 'redstone_lamp', { lit: false });
  return { button: [-1, Y, 0], lamp: [XM + 2, Y, 0] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { writeFileSync } = await import('node:fs');
  const { exportSchem } = await import('../src/export.ts');
  const w = new World(); buildTriplePulse(w);
  writeFileSync('examples/triple-pulse.schem', exportSchem(w).buffer);
}
