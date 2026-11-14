/**
 * One-lever quasi-connectivity (BUD) test for the real game. Run: npx tsx examples/microtests/quasi-auto.ts
 * ONE lever at the west end feeds a dust bus (z=2). Five tests along x, each a piston facing EAST at (ox,2,0):
 *  1 control : dust line ends against the piston                    -> extends at once
 *  2 QC dust, no kick: dust diagonal to the air cell above the piston -> sim: extends at once
 *  3 same as 2 + KICK (a sticky piston pushes a stone against the west side of the piston = block update)
 *  4 QC with STONE above the piston (dust on a step beside it), no kick
 *  5 same as 4 + KICK
 * Lever ON, wait, lever OFF, wait. Record with /doortrace over the whole schematic.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../../src/world.ts';
import { exportSchem } from '../../src/export.ts';
import type { Pos } from '../../src/dirs.ts';

const STEP = 10;
export const LEVER: Pos = [-4, 2, 2];
export const PISTONS: Pos[] = [0, 1, 2, 3, 4].map((i) => [i * STEP + 4, 2, 0]);

export function buildQuasiAuto(w: World): void {
  const end = 4 * STEP + 8;
  for (let x = -6; x <= end; x++) for (let z = -1; z <= 3; z++) w.place([x, 1, z], 'obsidian');
  w.place([-5, 2, 2], 'obsidian'); w.place(LEVER, 'lever', { face: 'wall', facing: 'east' });
  for (let x = -3; x <= end; x++) {
    if (x > 0 && x % 10 === 8) w.place([x, 2, 2], 'repeater', { facing: 'west', delay: 1 }); // input west
    else w.place([x, 2, 2], 'redstone_wire');
  }
  PISTONS.forEach(([ox], i) => {
    w.place([ox, 2, 0], 'piston', { facing: 'east' });
    if (i === 0) { w.place([ox, 2, 1], 'redstone_wire'); return; } // control: direct
    w.place([ox, 2, 1], 'stone'); // step beside the piston (north side, z=1)
    w.place([ox, 3, 1], 'redstone_wire');
    if (i >= 3) w.place([ox, 3, 0], 'stone'); // solid above the piston
    if (i === 2 || i === 4) { // kick
      w.place([ox - 3, 2, 0], 'sticky_piston', { facing: 'east' });
      w.place([ox - 2, 2, 0], 'stone');
      w.place([ox - 3, 2, 1], 'redstone_wire');
    }
  });
}

if (process.argv[1]?.endsWith('quasi-auto.ts')) {
  const f = new World(); buildQuasiAuto(f); f.run(20);
  const out = exportSchem(f);
  writeFileSync('examples/microtests/quasi-auto.schem', out.buffer);
  console.log('wrote quasi-auto.schem', out.size.join('x'));
  const w = new World(); buildQuasiAuto(w); w.run(20);
  const st = () => PISTONS.map((p) => (w.get(p).p.extended ? 'EXT' : '---')).join(' ');
  console.log('start', st()); w.use(LEVER); w.run(40); console.log('on   ', st());
  w.use(LEVER); w.run(40); console.log('off  ', st());
}
