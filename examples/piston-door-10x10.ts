/**
 * 10x10 piston door (slime / honey), simulated only. Run: npx tsx examples/piston-door-10x10.ts
 *
 * Doorway x=0..9, y=1..10, plane z=0 (walk through along z). Five bands (2 tall). Per band:
 *   - LEFT unit  x=1..4 (4x2 = 8 blocks) pulled 5 out to x=-4..-1 by a QUINT extender (4 pistons + 8 glued = 12, the limit)
 *   - RIGHT unit x=5..8 pulled 5 out to x=10..13 by a mirrored QUINT extender
 *   - edge columns x=0 and x=9 (1x2 each) sit one plane behind (z=1): a plain sticky piston at z=3 pushes the piece
 *     from z=2 to z=1 (a 10-wide half needs 5 columns; units are limited to 8 blocks, so the last column is its own
 *     tiny piece, one plane over so the big units can slide past x=0 without hitting it).
 * Lever OFF = closed, ON = open. When open the planes z=0 and z=1 are clear; the two edge pieces and their power
 * lines stand in the columns x=0 and x=9 south of the door (z>=2).
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Pos } from '../src/dirs.ts';
import { buildFlatArm, QUINT, Xf } from './flat-armN.ts';

const ROWS = 5;
export const DOOR10_X = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function buildDoor10(w: World, withEdges = true): { lever: Pos; door: Pos[] } {
  const solid = (x: number, y: number, z: number) => { if (w.get([x, y, z]).type === 'air') w.place([x, y, z], 'obsidian'); };
  const dust = (x: number, y: number, z: number) => { solid(x, y - 1, z); w.place([x, y, z], 'redstone_wire'); };
  const door: Pos[] = [];
  const inputs: { L: Pos[]; R: Pos[] } = { L: [], R: [] };
  const top = 2 * ROWS;

  for (let r = 0; r < ROWS; r++) {
    const ya = 1 + 2 * r;
    const left = new Xf(w, [-9, ya, 0], false);
    const right = new Xf(w, [18, ya, 0], true);
    const opts = { oneSided: true, tip: false, tapBlock: 'obsidian' as const, noLever: true };
    const a = buildFlatArm(left, QUINT, opts);
    const b = buildFlatArm(right, QUINT, opts);
    inputs.L.push(left.at(a.input)); inputs.R.push(right.at(b.input));
    for (const p of [left.at(a.input), right.at(b.input)]) w.place(p, 'repeater', { facing: 'north', delay: 1 });
    // F units alternate; the edge piece next to a unit must be the other glue
    const lt = r % 2 === 0 ? 'honey_block' : 'slime_block', rt = r % 2 === 0 ? 'slime_block' : 'honey_block';
    for (const y of [ya, ya + 1]) {
      for (const x of [-4, -3, -2, -1]) w.place([x, y, 0], lt);
      for (const x of [10, 11, 12, 13]) w.place([x, y, 0], rt);
    }
    for (const x of DOOR10_X) for (const y of [ya, ya + 1]) door.push(x === 0 || x === 9 ? [x, y, 1] : [x, y, 0]);
    // edge pieces (open position z=2), glue differs from the unit that slides past
    for (const [ex, et] of [[0, rt], [9, lt]] as const) {
      for (const y of [ya, ya + 1]) w.place([ex, y, 2], et);
      solid(ex, ya, 4); // support for the feeder repeater
      w.place([ex, ya + 1, 3], 'sticky_piston', { facing: 'north' });
      w.place([ex, ya + 1, 4], 'repeater', { facing: 'south', delay: 1 });
    }
  }
  // ---- risers: ROWS inputs per side at y=2,4,..,top joined by a dust staircase going down-north ----
  const riser = (ins: Pos[], d: number) => {
    const [X, , Z] = ins[0];
    const XR = X + 3 * d;
    for (let r = 0; r < ROWS; r++) {
      const y = 2 + 2 * r, Zr = Z - 1 - 2 * (ROWS - 1 - r);
      for (let z = Z - 1; z >= Zr; z--) dust(X, y, z);
      const topRow = r === ROWS - 1;
      for (let k = 1; k <= (topRow ? 3 : 2); k++) {
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
  for (let x = -3; x <= 14; x++) cells.push([x, yb, Zb]);
  cells.push([15, top + 1, Zb], [16, top, Zb]);
  const xb = rr.XR + 1; // outside the stair column
  for (let x = 17; x <= xb; x++) cells.push([x, top, Zb]);
  for (let z = Zb + 1; z <= rr.Z - 1; z++) cells.push([xb, top, z]);
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

  // ---- edge power: lines along x=0 / x=9 to z=27, then a dust staircase outside the lanes (z>=28), fed from a spur ----
  const ZE = 27;
  const gl = (ex: number, d: number) => {
    // d: direction of the lead (-1 west for x=0, +1 east for x=9)
    for (let r = 0; r < ROWS; r++) {
      const y = 2 + 2 * r;
      const Zr = ZE + 1 + 2 * (ROWS - 1 - r);
      for (let z = Zr; z >= 5; z--) {
        solid(ex, y - 1, z);
        if ((Zr - z) % 8 === 4 && z > 5) w.place([ex, y, z], 'repeater', { facing: 'south', delay: 1 });
        else w.place([ex, y, z], 'redstone_wire');
      }
      const topRow = r === ROWS - 1;
      for (let k = 1; k <= (topRow ? 3 : 2); k++) {
        if (k === 2) { solid(ex + d * k, y - 1, Zr); w.place([ex + d * k, y, Zr], 'repeater', { facing: d > 0 ? 'east' : 'west', delay: 1 }); }
        else dust(ex + d * k, y, Zr);
      }
    }
    const XR = ex + 3 * d;
    for (let i = 1; i <= top - 2; i++) dust(XR, top - i, ZE + 1 + i);
    // join: repeater just outside the stair top, fed from the spur
    const xj = XR + d, xs = XR + 2 * d;
    solid(xj, top - 1, ZE + 1);
    w.place([xj, top, ZE + 1], 'repeater', { facing: d > 0 ? 'east' : 'west', delay: 1 });
    // spur end: from (xs, yb, ZE-1) down to (xs, top, ZE+1)
    dust(xs, yb, ZE - 1);
    dust(xs, top + 1, ZE);
    dust(xs, top, ZE + 1);
    return xs;
  };
  const xsL = gl(0, -1), xsR = gl(9, +1);
  // spur: from the bus beam at x=xm south along y=yb to z=ZE-1, then west / east to the staircase heads
  let xm = 4;
  while (w.get([xm, yb, Zb]).type !== 'redstone_wire') xm++;
  for (let z = Zb + 1; z <= ZE - 1; z++) {
    solid(xm, yb - 1, z);
    if ((z - Zb) % 8 === 1 && z < ZE - 3) w.place([xm, yb, z], 'repeater', { facing: 'north', delay: 1 });
    else w.place([xm, yb, z], 'redstone_wire');
  }
  for (let x = xm - 1; x > xsL; x--) {
    solid(x, yb - 1, ZE - 1);
    if ((xm - x) % 5 === 1) w.place([x, yb, ZE - 1], 'repeater', { facing: 'east', delay: 1 });
    else w.place([x, yb, ZE - 1], 'redstone_wire');
  }
  for (let x = xm + 1; x < xsR; x++) {
    solid(x, yb - 1, ZE - 1);
    if ((x - xm) % 5 === 1) w.place([x, yb, ZE - 1], 'repeater', { facing: 'west', delay: 1 });
    else w.place([x, yb, ZE - 1], 'redstone_wire');
  }
  return { lever: [xl - 2, top + 1, zl], door };
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
