/**
 * 5x5 piston door (slime / honey), simulated only. Run: npx tsx examples/piston-door-5x5.ts
 *
 * Doorway x=0..4, y=1..5 in the plane z=0 (walk through along z). Three bands: y=1-2, y=3-4 and y=5 (one row).
 * Each band is a LEFT pack (2 wide) pulled 2 blocks out by a DOUBLE extender and a RIGHT pack (3 wide) pulled 3 blocks
 * out by a TRIPLE extender (examples/flat-armN.ts). The door blocks are the glue (slime / honey, alternating per band).
 * Same wiring scheme as the confirmed 6x6 (one-sided modules stacked every 2 blocks, staircase risers, bus over the
 * doorway at y=8, torch inverter). Lever OFF = closed, ON = open.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Pos } from '../src/dirs.ts';
import { buildFlatArm, DOUBLE, TRIPLE, Xf } from './flat-armN.ts';

export const DOOR_X = [0, 1, 2, 3, 4];

export function buildDoor5(w: World): { lever: Pos; door: Pos[] } {
  const isAir = (p: Pos) => w.get(p).type === 'air';
  const solid = (x: number, y: number, z: number) => { if (isAir([x, y, z])) w.place([x, y, z], 'obsidian'); };
  const dust = (x: number, y: number, z: number) => { solid(x, y - 1, z); w.place([x, y, z], 'redstone_wire'); };
  const door: Pos[] = [];
  const inputs: { L: Pos[]; R: Pos[] } = { L: [], R: [] };

  for (let r = 0; r < 3; r++) {
    const ya = 1 + 2 * r;
    const left = new Xf(w, [-4, ya, 0], false);
    const right = new Xf(w, [10, ya, 0], true);
    const opts = { oneSided: true, tip: false, tapBlock: 'obsidian' as const, noLever: true };
    const a = buildFlatArm(left, DOUBLE, opts);
    const b = buildFlatArm(right, TRIPLE, opts);
    inputs.L.push(left.at(a.input)); inputs.R.push(right.at(b.input));
    // the input cell becomes a repeater (regenerates the long lead; output south into the module's trunk)
    for (const p of [left.at(a.input), right.at(b.input)]) w.place(p, 'repeater', { facing: 'north', delay: 1 });
    // blocks at their OPEN positions (arms retracted); closing happens when the bus is powered
    const lt = r % 2 === 0 ? 'honey_block' : 'slime_block', ut = r % 2 === 0 ? 'slime_block' : 'honey_block';
    const ys = r < 2 ? [ya, ya + 1] : [ya];
    for (const y of ys) {
      for (const x of [-2, -1]) w.place([x, y, 0], lt);
      for (const x of [5, 6, 7]) w.place([x, y, 0], ut);
    }
    for (const x of DOOR_X) for (const y of ys) door.push([x, y, 0]);
  }

  // ---- risers: three inputs per side (y=2,4,6) joined by a dust staircase, each side's inputs are identical in x,z ----
  const riser = (ins: Pos[], d: number) => {
    const [X, , Z] = ins[0];
    const XR = X + 3 * d;
    const ysOf = [2, 4, 6];
    for (let r = 0; r < 3; r++) {
      const y = ysOf[r], Zr = Z - 1 - 2 * (2 - r);
      for (let z = Z - 1; z >= Zr; z--) dust(X, y, z);
      if (r < 2) for (let k = 1; k <= 2; k++) dust(X + d * k, y, Zr);
      else for (let k = 1; k <= 3; k++) dust(X + d * k, y, Zr);
    }
    // stair at x=XR going down-north from (6,Z-1)
    for (let i = 1; i <= 4; i++) dust(XR, 6 - i, Z - 1 - i);
    return { XR, Z };
  };
  const rl = riser(inputs.L, -1), rr = riser(inputs.R, +1);

  // ---- master: lever + torch inverter at the left riser; bus branches north then over the doorway to the right riser ----
  const { XR: xl } = rl;
  const zl = rl.Z - 1; // z of the top lead
  solid(xl - 2, 5, zl);
  w.place([xl - 2, 6, zl], 'obsidian');
  w.place([xl - 2, 7, zl], 'lever', { face: 'floor' });
  w.place([xl - 1, 6, zl], 'redstone_wall_torch', { facing: 'east' });
  // bus: start north of the torch
  const Zb = Math.min(rl.Z, rr.Z) - 10;
  const cells: Pos[] = [];
  for (let z = zl - 1; z >= Zb; z--) cells.push([xl - 1, 6, z]);
  for (let x = xl; x <= -6; x++) cells.push([x, 6, Zb]);
  cells.push([-5, 7, Zb], [-4, 8, Zb]);
  for (let x = -3; x <= 8; x++) cells.push([x, 8, Zb]);
  cells.push([9, 7, Zb], [10, 6, Zb]);
  const xr1 = rr.XR - 2; // x of the right side's lead column (X+1)
  for (let x = 11; x <= xr1; x++) cells.push([x, 6, Zb]);
  for (let z = Zb + 1; z <= rr.Z - 2; z++) cells.push([xr1, 6, z]);
  let run = 0;
  cells.forEach((c, i) => {
    if (i === cells.length - 1) { solid(c[0], c[1] - 1, c[2]); w.place(c, 'repeater', { facing: 'north', delay: 1 }); return; }
    const p = cells[i - 1], n = cells[i + 1];
    run++;
    solid(c[0], c[1] - 1, c[2]);
    const straight = p && n && (n[0] - c[0]) === (c[0] - p[0]) && (n[1] - c[1]) === (c[1] - p[1]) && (n[2] - c[2]) === (c[2] - p[2]) && c[1] === p[1] && c[1] === n[1];
    if (run >= 11 && straight) {
      const dx = n[0] - c[0], dz = n[2] - c[2];
      w.place(c, 'repeater', { facing: dx > 0 ? 'west' : dx < 0 ? 'east' : dz > 0 ? 'north' : 'south', delay: 1 });
      run = 0;
    } else w.place(c, 'redstone_wire');
  });
  return { lever: [xl - 2, 7, zl], door };
}

export const isClosed = (w: World, door: Pos[]) => door.every((p) => /slime|honey/.test(w.get(p).type));
export const isOpen = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'air');

if (process.argv[1]?.endsWith('piston-door-5x5.ts')) {
  const w = new World();
  const { lever, door } = buildDoor5(w);
  w.run(800);
  console.log('closed after settling:', isClosed(w, door));
  for (let i = 0; i < 2; i++) {
    w.use(lever); w.run(800); console.log('open:', isOpen(w, door));
    w.use(lever); w.run(800); console.log('closed:', isClosed(w, door));
  }
  const out = exportSchem(w);
  writeFileSync('examples/piston-door-5x5.schem', out.buffer);
  console.log('exported', out.size.join('x'), 'lever at', lever.map((v, i) => v - out.origin[i]).join(','));
}
