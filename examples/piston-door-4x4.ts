/**
 * 4x4 sticky-piston door. Run: npx tsx examples/piston-door-4x4.ts
 *
 * Door plane z=0, doorway x=0..3, y=1..4 (you walk through along z). Lever ON = open, OFF = closed.
 * Four 2x2 quadrants, each glued to a 2x2 sheet of slime/honey behind it (z=1) and moved 2 blocks by its own
 * double piston extender (examples/arm.ts):
 *   bottom-left  (slime): drops into the floor    bottom-right (honey): drops into the floor
 *   top-left     (honey): rises into the wall     top-right    (slime): rises into the wall
 * Slime and honey do not stick to each other, so the checkerboard keeps the four quadrants independent.
 * The top quadrants' extenders stand beside the door and reach in through a two-block "tail" of glue.
 * Everything that touches slime/honey is obsidian or air (they glue to any pushable block).
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { buildArm } from './arm.ts';
import type { Dir, Pos } from '../src/dirs.ts';

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

export function buildDoor4(w: World): { lever: Pos; door: Pos[] } {
  const free = new Set<string>();
  const carve = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) free.add(key(x, y, z));
  };
  const ob = (x: number, y: number, z: number) => w.place([x, y, z], 'obsidian');
  const wire = (x: number, y: number, z: number) => w.place([x, y, z], 'redstone_wire');
  const rep = (x: number, y: number, z: number, facing: Dir, delay: number) =>
    w.place([x, y, z], 'repeater', { facing, delay });

  // ---- empty space ----
  carve(0, 3, 1, 4, -2, 2);          // doorway tunnel (through the front cover too)
  carve(0, 3, -1, 0, 0, 1);          // where the bottom quadrants rest when open
  carve(0, 3, 5, 6, 0, 1);           // where the top quadrants rest when open
  carve(-2, -1, 4, 6, 1, 1);         // top-left tail path
  carve(4, 5, 4, 6, 1, 1);           // top-right tail path
  carve(-2, -2, 2, 6, 1, 1);         // top-left arm column
  carve(5, 5, 2, 6, 1, 1);           // top-right arm column
  carve(-4, -2, 1, 5, -1, 6);        // top-left circuit
  carve(5, 7, 1, 5, -1, 6);          // top-right circuit
  for (const x of [0, 3]) { free.add(key(x, 0, 9)); free.add(key(x, 0, 10)); } // floor holes for the dust stairs

  // ---- wall (3 thick) and floor, obsidian ----
  for (let x = -9; x <= 12; x++) for (let y = 0; y <= 8; y++) for (let z = -1; z <= 1; z++) if (!free.has(key(x, y, z))) ob(x, y, z);
  for (let x = -9; x <= 12; x++) for (let y = 0; y <= 8; y++) if (!free.has(key(x, y, -2))) ob(x, y, -2); // plain front cover
  for (let x = -9; x <= 12; x++) for (let z = 2; z <= 16; z++) if (!free.has(key(x, 0, z))) ob(x, 0, z);
  w.place([0, 0, 9], 'glass'); w.place([3, 0, 9], 'glass');

  // ---- the four extenders (one-sided circuit, see arm.ts) ----
  const bl = buildArm(w, [0, -3, 1], { skipTip: true });
  const br = buildArm(w, [3, -3, 1], { skipTip: true, mirror: true });
  const tl = buildArm(w, [-2, 2, 1], { skipTip: true });
  const tr = buildArm(w, [5, 2, 1], { skipTip: true, mirror: true });

  // ---- the door: 16 stone ----
  const door: Pos[] = [];
  for (const x of [0, 1, 2, 3]) for (const y of [1, 2, 3, 4]) { w.place([x, y, 0], 'stone'); door.push([x, y, 0]); }
  // glue sheets behind each quadrant (checkerboard of slime / honey)
  const sheet = (x0: number, y0: number, type: string) => { for (const x of [x0, x0 + 1]) for (const y of [y0, y0 + 1]) w.place([x, y, 1], type); };
  sheet(0, 1, 'slime_block'); sheet(2, 1, 'honey_block'); sheet(0, 3, 'honey_block'); sheet(2, 3, 'slime_block');
  // tails for the top quadrants (the extender's tip is the outermost tail block)
  w.place([-1, 4, 1], 'honey_block'); w.place([-2, 4, 1], 'honey_block');
  w.place([4, 4, 1], 'slime_block'); w.place([5, 4, 1], 'slime_block');

  // ---- controls ----
  // lever ON = open. bus2 (powered when OPEN) is the lever's own signal, for the two top extenders;
  // bus1 (powered when CLOSED) comes from a torch inverter, for the two bottom extenders.
  ob(6, 1, 12);                                         // lever block (also the torch's support)
  w.place([5, 1, 12], 'redstone_wall_torch', { facing: 'west' });
  // bus1: along z=12 to the two staircases down to the bottom extenders
  wire(4, 1, 12); wire(3, 1, 12); rep(2, 1, 12, 'east', 1); wire(1, 1, 12); wire(0, 1, 12);
  for (const x of [0, 3]) {
    ob(x, -1, 10); ob(x, -2, 9); ob(x, -3, 8); ob(x, -4, 7);       // supports first
    wire(x, 1, 11); wire(x, 0, 10); wire(x, -1, 9); wire(x, -2, 8); wire(x, -3, 7);
  }
  void bl; void br; void tl; void tr;
  // bus2 (powered when OPEN): the lever's own signal feeds the two top extenders
  ob(7, 1, 12);
  wire(7, 2, 12); wire(8, 1, 12);
  // to the top-right extender
  wire(8, 1, 11); wire(8, 1, 10); rep(8, 1, 9, 'south', 1); wire(8, 1, 8); wire(8, 1, 7); wire(7, 1, 7); wire(6, 1, 7); wire(5, 1, 7);
  // to the top-left extender, along z=14 then up x=-2
  for (const z of [13, 14]) wire(8, 1, z);
  for (const x of [7, 6, 5]) wire(x, 1, 14);
  rep(4, 1, 14, 'east', 1);
  for (const x of [3, 2, 1, 0, -1, -2]) wire(x, 1, 14);
  wire(-2, 1, 13); wire(-2, 1, 12); rep(-2, 1, 11, 'south', 1);
  for (const z of [10, 9, 8, 7]) wire(-2, 1, z);
  w.place([6, 2, 12], 'lever', { face: 'floor' });
  return { lever: [6, 2, 12], door };
}

const isClosed = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'stone');
const isOpen = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'air');

/** Front view (x across, y up) of one z plane. */
export function elevation(w: World, z: number, x0 = -7, x1 = 10, y0 = -4, y1 = 8): string {
  const sym = (t: string, p: Record<string, any>) =>
    t === 'air' ? '.' : t === 'obsidian' ? 'X' : t === 'stone' ? '#' : t === 'slime_block' ? 's' : t === 'honey_block' ? 'h' : t === 'glass' ? 'g' :
    t === 'sticky_piston' ? 'P' : t === 'piston_head' ? '=' : t === 'moving_piston' ? '~' : t === 'observer' ? 'o' :
    t === 'redstone_wire' ? p.power.toString(16) : t === 'repeater' ? 'r' : t === 'redstone_torch' || t === 'redstone_wall_torch' ? 'T' : t === 'lever' ? 'l' : '?';
  const rows: string[] = [];
  for (let y = y1; y >= y0; y--) {
    let r = String(y).padStart(3) + ' ';
    for (let x = x0; x <= x1; x++) { const b = w.get([x, y, z]); r += sym(b.type, b.p); }
    rows.push(r);
  }
  return rows.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World();
  const { lever, door } = buildDoor4(w);
  w.run(150);
  console.log('closed after settling:', isClosed(w, door));
  let openT = 0, closeT = 0;
  for (let i = 0; i < 3; i++) {
    w.use(lever); let t = 0; while (!isOpen(w, door) && t < 300) { w.step(); t++; } openT = t; w.run(80);
    w.use(lever); t = 0; while (!isClosed(w, door) && t < 300) { w.step(); t++; } closeT = t; w.run(80);
  }
  console.log(`3 cycles ok; open ${openT} ticks, close ${closeT} ticks`);
  const closedView = elevation(w, 0), closedBack = elevation(w, 1);
  const out = exportSchem(w);
  writeFileSync('examples/piston-door-4x4.schem', out.buffer);
  console.log('exported size', out.size.join('x'), 'origin', out.origin.join(','), 'lever at schematic', lever.map((v, i) => v - out.origin[i]).join(','));
  const cnt: Record<string, number> = {};
  for (const b of w.listBlocks()) cnt[b.type] = (cnt[b.type] || 0) + 1;
  console.log(JSON.stringify(cnt));
  w.use(lever); w.run(100);
  const openView = elevation(w, 0), openBack = elevation(w, 1);
  writeFileSync('examples/piston-door-4x4.views.txt', `CLOSED, door plane z=0\n${closedView}\n\nOPEN, door plane z=0\n${openView}\n\nCLOSED, glue plane z=1\n${closedBack}\n\nOPEN, glue plane z=1\n${openBack}\n`);
  console.log(closedView + '\n\n' + openView);
}
