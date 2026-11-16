/**
 * PISTON TRAIN (30 sticky pistons in a row, all facing east, a payload block in front). One lever starts a WAVE that ripples from the FRONT piston to the tail:
 * each piston gets a 2 gt observer pulse (short pulse = the sticky piston drops its load instead of pulling it back), 8 gt after the one in front of it.
 * Every piston therefore only pushes the one block ahead into the gap its front neighbour just made, so the 12-block push limit never applies.
 * One wave: payload +1, train +1 (a gap is left behind the tail). The lever flip ON runs a wave and flip OFF runs another one (observers see both edges).
 * Layout (z): 0 = pistons, 1 = observers (face south, look at the delay row, back into the piston), 2 = delay row of repeaters (delay 4 = 8 gt, flowing west).
 * Colours: delay row supports lime, lever support purple, payload red wool. Simulated only, not checked in the real game.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';

export function buildTrain(w: World, n = 30): { lever: [number, number, number]; payload: [number, number, number] } {
  for (let x = 0; x < n; x++) {
    w.setRaw([x, 0, 0], 'sticky_piston', { facing: 'east', extended: false });
    w.setRaw([x, 0, 1], 'observer', { facing: 'south', powered: false });
    w.setRaw([x, -1, 2], 'lime_wool');
    w.setRaw([x, 0, 2], 'repeater', { facing: 'east', delay: 4, powered: false });
  }
  w.setRaw([n, -1, 2], 'purple_wool'); w.setRaw([n, 0, 2], 'lever', { face: 'floor', facing: 'north', powered: false });
  w.setRaw([n, 0, 0], 'red_wool');
  return { lever: [n, 0, 2], payload: [n, 0, 0] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World(); buildTrain(w);
  writeFileSync('examples/piston-train.schem', exportSchem(w).buffer);
}
