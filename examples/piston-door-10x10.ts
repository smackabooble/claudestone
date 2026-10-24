/**
 * 10x10 piston door (slime / honey), simulated only. Run: npx tsx examples/piston-door-10x10.ts
 *
 * Doorway x=0..9, y=1..10, one flush plane z=0, ALL glue (slime/honey), nothing else visible. Ten 1-tall rows stacked
 * at pitch 1. Every row has its own QUINT extender on each side (5 sticky pistons, 4 pistons + a 5-block unit = 9
 * pushed): LEFT unit x=0..4 pulled 5 out to x=-5..-1, RIGHT unit x=5..9 pulled out to x=10..14.
 * Idea from the 10x10 reference (abfielder): all rows share the controllers. Only ONE controller module per side
 * (examples/flat-armN.ts, QUINT) builds the waveforms; each tap lane ends in a zigzag of dust and hoppers
 * (the "ladder", ArmOpts.ladder) beside the stack of pistons. Dust at z=+-1 powers odd rows directly and even rows
 * by quasi-connectivity, so one lane drives the same piston of every row.
 * Lever OFF = closed, ON = open.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Pos } from '../src/dirs.ts';
import { buildFlatArm, QUINT, Xf } from './flat-armN.ts';

const ROWS = 10;
export const DOOR10_X = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function buildDoor10(w: World): { lever: Pos; door: Pos[] } {
  const solid = (x: number, y: number, z: number) => { if (w.get([x, y, z]).type === 'air') w.place([x, y, z], 'obsidian'); };
  const door: Pos[] = [];
  const left = new Xf(w, [-10, 0, 0], false);
  const right = new Xf(w, [19, 0, 0], true);
  const opts = { oneSided: true, tip: false, arm: false, tapBlock: 'obsidian' as const, noLever: true, ladder: ROWS };
  const a = buildFlatArm(left, QUINT, opts);
  const b = buildFlatArm(right, QUINT, opts);
  for (let y = 1; y <= ROWS; y++) {
    const ny = y;
    for (let x = 0; x < 5; x++) { left.place([x, ny, 0], 'sticky_piston', { facing: 'east' }); right.place([x, ny, 0], 'sticky_piston', { facing: 'east' }); }
    const lt = y % 2 === 1 ? 'honey_block' : 'slime_block', rt = y % 2 === 1 ? 'slime_block' : 'honey_block';
    for (let x = 5; x < 10; x++) { left.place([x, ny, 0], lt); right.place([x, ny, 0], rt); }
    for (const x of DOOR10_X) door.push([x, y, 0]);
  }
  // ---- master: lever + torch inverter feeding the left input, flat bus on the floor (y=1, dust is walkable) ----
  const [xl, , zi] = left.at(a.input), [xr, , zr] = right.at(b.input);
  const Zb = zi - 3;
  w.place([xl, 1, zi], 'repeater', { facing: 'north', delay: 1 });
  w.place([xr, 1, zr], 'repeater', { facing: 'north', delay: 1 });
  solid(xl - 2, 0, zi - 1);
  w.place([xl - 2, 1, zi - 1], 'obsidian');
  w.place([xl - 2, 2, zi - 1], 'lever', { face: 'floor' });
  w.place([xl - 1, 1, zi - 1], 'redstone_wall_torch', { facing: 'east' });
  const cells: Pos[] = [];
  for (let z = zi - 1; z >= Zb; z--) cells.push([xl, 1, z]);
  for (let x = xl + 1; x <= xr; x++) cells.push([x, 1, Zb]);
  for (let z = Zb + 1; z <= zr - 1; z++) cells.push([xr, 1, z]);
  let run = 0;
  cells.forEach((c, i) => {
    solid(c[0], 0, c[2]);
    const p = cells[i - 1], n = cells[i + 1];
    run++;
    const straight = p && n && (n[0] - c[0]) === (c[0] - p[0]) && (n[2] - c[2]) === (c[2] - p[2]);
    if (run >= 11 && straight) {
      const dx = n[0] - c[0], dz = n[2] - c[2];
      w.place(c, 'repeater', { facing: dx > 0 ? 'west' : dx < 0 ? 'east' : dz > 0 ? 'north' : 'south', delay: 1 });
      run = 0;
    } else w.place(c, 'redstone_wire');
  });
  return { lever: [xl - 2, 2, zi - 1], door };
}

export const isClosed10 = (w: World, door: Pos[]) => door.every((p) => /slime|honey/.test(w.get(p).type));
export const isOpen10 = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'air');

if (process.argv[1]?.endsWith('piston-door-10x10.ts')) {
  const w = new World();
  const { lever, door } = buildDoor10(w);
  w.run(1500);
  console.log('closed after settling:', isClosed10(w, door));
  for (let i = 0; i < 2; i++) {
    w.use(lever); w.run(1500); console.log('open:', isOpen10(w, door));
    w.use(lever); w.run(1500); console.log('closed:', isClosed10(w, door));
  }
  const out = exportSchem(w);
  writeFileSync('examples/piston-door-10x10.schem', out.buffer);
  console.log('exported', out.size.join('x'));
}
