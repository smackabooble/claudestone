/**
 * 8x8 piston door (slime / honey), simulated only. Run: npx tsx examples/piston-door-8x8.ts
 *
 * Doorway x=0..7, y=1..8 in the plane z=0 (walk through along z). Four rows (2 tall); each row is a LEFT unit (two 2x2
 * quads glued, 8 blocks) and a RIGHT unit (8 blocks), each pulled 4 blocks out by its own QUAD extender
 * (examples/flat-armN.ts, N=4): left units open to x=-4..-1, right units to x=8..11. The door blocks are the glue,
 * rows alternate slime/honey and the two units of a row differ, so nothing sticks to anything it should not.
 * Eight one-sided extender modules (4 per side) are stacked every 2 blocks in y in the side walls, their lever
 * inputs joined by dust staircases; one bus crosses over the doorway at y=10. Lever OFF = closed, ON = open.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Pos } from '../src/dirs.ts';
import { buildFlatArm, QUAD, Xf } from './flat-armN.ts';

const ROWS = 4;
export const DOOR8_X = [0, 1, 2, 3, 4, 5, 6, 7];

export function buildDoor8(w: World): { lever: Pos; door: Pos[] } {
  const solid = (x: number, y: number, z: number) => { if (w.get([x, y, z]).type === 'air') w.place([x, y, z], 'obsidian'); };
  const dust = (x: number, y: number, z: number) => { solid(x, y - 1, z); w.place([x, y, z], 'redstone_wire'); };
  const door: Pos[] = [];
  const inputs: { L: Pos[]; R: Pos[] } = { L: [], R: [] };
  const top = 2 * ROWS; // y of the top module's circuit plane

  for (let r = 0; r < ROWS; r++) {
    const ya = 1 + 2 * r;
    const left = new Xf(w, [-8, ya, 0], false);
    const right = new Xf(w, [15, ya, 0], true);
    const opts = { oneSided: true, tip: false, tapBlock: 'obsidian' as const, noLever: true };
    const a = buildFlatArm(left, QUAD, opts);
    const b = buildFlatArm(right, QUAD, opts);
    inputs.L.push(left.at(a.input)); inputs.R.push(right.at(b.input));
    for (const p of [left.at(a.input), right.at(b.input)]) w.place(p, 'repeater', { facing: 'north', delay: 1 });
    const lt = r % 2 === 0 ? 'honey_block' : 'slime_block', rt = r % 2 === 0 ? 'slime_block' : 'honey_block';
    for (const y of [ya, ya + 1]) {
      for (const x of [-4, -3, -2, -1]) w.place([x, y, 0], lt);
      for (const x of [8, 9, 10, 11]) w.place([x, y, 0], rt);
    }
    for (const x of DOOR8_X) for (const y of [ya, ya + 1]) door.push([x, y, 0]);
  }

  // ---- risers: ROWS inputs per side at y=2,4,..,top joined by a dust staircase going down-north ----
  const riser = (ins: Pos[], d: number) => {
    const [X, , Z] = ins[0];
    const XR = X + 3 * d;
    for (let r = 0; r < ROWS; r++) {
      const y = 2 + 2 * r, Zr = Z - 1 - 2 * (ROWS - 1 - r);
      for (let z = Z - 1; z >= Zr; z--) dust(X, y, z);
      const top = r === ROWS - 1;
      for (let k = 1; k <= (top ? 3 : 2); k++) {
        if (k === 2) { solid(X + d * k, y - 1, Zr); w.place([X + d * k, y, Zr], 'repeater', { facing: d > 0 ? 'east' : 'west', delay: 1 }); }
        else dust(X + d * k, y, Zr);
      }
    }
    for (let i = 1; i <= top - 2; i++) dust(XR, top - i, Z - 1 - i);
    return { X, XR, Z };
  };
  const rl = riser(inputs.L, -1), rr = riser(inputs.R, +1);

  // ---- master: lever + torch inverter at the left riser, bus north then over the doorway to the right riser ----
  const xl = rl.XR, zl = rl.Z - 1;
  solid(xl - 2, top - 1, zl);
  w.place([xl - 2, top, zl], 'obsidian');
  w.place([xl - 2, top + 1, zl], 'lever', { face: 'floor' });
  w.place([xl - 1, top, zl], 'redstone_wall_torch', { facing: 'east' });
  const Zb = Math.min(rl.Z, rr.Z) - 12 - 2 * ROWS;
  const yb = top + 2;
  const cells: Pos[] = [];
  for (let z = zl - 1; z >= Zb; z--) cells.push([xl - 1, top, z]);
  for (let x = xl; x <= -6; x++) cells.push([x, top, Zb]);
  cells.push([-5, top + 1, Zb], [-4, yb, Zb]);
  for (let x = -3; x <= 12; x++) cells.push([x, yb, Zb]);
  cells.push([13, top + 1, Zb], [14, top, Zb]);
  const xb = rr.XR + 1; // outside the stair column
  for (let x = 15; x <= xb; x++) cells.push([x, top, Zb]);
  for (let z = Zb + 1; z <= rr.Z - 1 - 0; z++) cells.push([xb, top, z - 0]);
  let run = 0;
  cells.forEach((c, i) => {
    const p = cells[i - 1], n = cells[i + 1];
    run++;
    solid(c[0], c[1] - 1, c[2]);
    if (i === cells.length - 1) { w.place(c, 'repeater', { facing: 'east', delay: 1 }); return; }
    const straight = p && n && (n[0] - c[0]) === (c[0] - p[0]) && (n[1] - c[1]) === (c[1] - p[1]) && (n[2] - c[2]) === (c[2] - p[2]) && c[1] === p[1] && c[1] === n[1];
    if (run >= 11 && straight) {
      const dx = n[0] - c[0], dz = n[2] - c[2];
      w.place(c, 'repeater', { facing: dx > 0 ? 'west' : dx < 0 ? 'east' : dz > 0 ? 'north' : 'south', delay: 1 });
      run = 0;
    } else w.place(c, 'redstone_wire');
  });
  return { lever: [xl - 2, top + 1, zl], door };
}

export const isClosed8 = (w: World, door: Pos[]) => door.every((p) => /slime|honey/.test(w.get(p).type));
export const isOpen8 = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'air');

if (process.argv[1]?.endsWith('piston-door-8x8.ts')) {
  const w = new World();
  const { lever, door } = buildDoor8(w);
  w.run(1000);
  console.log('closed after settling:', isClosed8(w, door));
  for (let i = 0; i < 2; i++) {
    w.use(lever); w.run(1000); console.log('open:', isOpen8(w, door));
    w.use(lever); w.run(1000); console.log('closed:', isClosed8(w, door));
  }
  const out = exportSchem(w);
  writeFileSync('examples/piston-door-8x8.schem', out.buffer);
  console.log('exported', out.size.join('x'));
}
