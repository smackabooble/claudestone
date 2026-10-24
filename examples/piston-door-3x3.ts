/**
 * 3x3 sticky-piston door. Run: npx tsx examples/piston-door-3x3.ts
 *
 * Door plane z=0, doorway x=0..2, y=1..3 (you walk through along z). Lever ON = open, OFF = closed.
 * Every block that touches slime is obsidian (or air), because slime glues to any pushable block.
 *
 *  - left column  (x=0): 3 stone glued to 3 slime blocks in the wall; one sticky piston pulls them 1 block left
 *  - right column (x=2): same, mirrored
 *  - top centre   (1,3): one sticky piston above pulls it up 1 block
 *  - lower centre (1,1),(1,2): needs to travel 2 blocks, so two stone + two slime (behind them) are pulled DOWN
 *    into the floor by a double piston extender (the tested upright circuit, buried under the door)
 *  - control: lever -> torch inverter -> bus dust on the floor behind the door
 *      * left/right pistons: repeater stubs
 *      * top piston: a 2-torch tower carries the signal up to y=5
 *      * extender: dust staircase down into the floor
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { bounds, render, LEGEND } from '../src/view.ts';
import type { Dir, Pos } from '../src/dirs.ts';

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

export function buildDoor3(w: World): { lever: Pos; door: Pos[] } {
  const free = new Set<string>();
  const carve = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) free.add(key(x, y, z));
  };
  const ob = (x: number, y: number, z: number) => w.place([x, y, z], 'obsidian');
  const wire = (x: number, y: number, z: number) => w.place([x, y, z], 'redstone_wire');
  const rep = (x: number, y: number, z: number, facing: Dir, delay: number) =>
    w.place([x, y, z], 'repeater', { facing, delay });

  // ---- spaces that must stay empty ----
  carve(0, 2, 1, 3, -1, 2);      // doorway tunnel
  carve(-3, -1, 1, 3, 0, 0);     // left slot
  carve(3, 5, 1, 3, 0, 0);       // right slot
  carve(1, 1, 4, 5, 0, 0);       // top slot
  carve(1, 1, -1, 0, 0, 1);      // where the lower centre pair rests when open
  carve(-3, -3, 1, 1, 1, 1);     // repeater stubs inside the wall
  carve(5, 5, 1, 1, 1, 1);
  carve(1, 1, 5, 5, 1, 1);
  free.add(key(1, 0, 9)); free.add(key(1, 0, 10)); // floor holes for the dust staircase

  // ---- wall (3 thick) and floor, all obsidian ----
  for (let x = -8; x <= 10; x++) for (let y = 0; y <= 8; y++) for (let z = -1; z <= 1; z++) if (!free.has(key(x, y, z))) ob(x, y, z);
  for (let x = -8; x <= 10; x++) for (let z = 2; z <= 13; z++) if (!free.has(key(x, 0, z))) ob(x, 0, z);
  w.place([1, 0, 9], 'glass'); // non-conducting cover so the dust can climb the staircase under it

  // ---- supports for the circuits (obsidian, never stone: slime would glue stone) ----
  const Pr = (x: number, y: number, z: number): Pos => [x + 1, y - 3, z + 1]; // extender circuit origin (1,-3,1)
  const obr = (x: number, y: number, z: number) => w.place(Pr(x, y, z), 'obsidian');
  for (const [x, z] of [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 5], [2, 5], [2, 4], [2, 3], [2, 2]]) obr(x, -1, z);
  obr(2, 0, 1); obr(2, 1, 0); obr(1, 1, 0); obr(-1, 0, 0);
  for (const [x, z] of [[0, -2], [-1, -2], [-2, -2], [-2, -1], [-2, 0]]) obr(x, 0, z);
  for (const [x, y, z] of [
    // dust staircase from the floor down to the extender
    [1, -4, 7], [1, -3, 8], [1, -2, 9], [1, -1, 10],
    // torch inverter support
    [7, 1, 4],
    // torch tower
    [-5, 1, 3], [-5, 3, 3], [-5, 5, 3],
  ] as [number, number, number][]) ob(x, y, z);
  // support blocks under the top run of dust
  for (let x = -4; x <= 1; x++) ob(x, 4, 3);
  ob(1, 4, 2);

  // ---- the door ----
  for (const x of [0, 1, 2]) for (const y of [1, 2, 3]) w.place([x, y, 0], 'stone');
  for (const y of [1, 2, 3]) { w.place([-1, y, 0], 'slime_block'); w.place([3, y, 0], 'slime_block'); }
  w.place([1, 1, 1], 'slime_block'); w.place([1, 2, 1], 'slime_block');
  w.place([-3, 1, 0], 'sticky_piston', { facing: 'east' });
  w.place([5, 1, 0], 'sticky_piston', { facing: 'west' });
  w.place([1, 5, 0], 'sticky_piston', { facing: 'down' });

  // ---- extender circuit (the tested upright design, shifted to origin (1,-3,1)) ----
  const P = Pr;
  const wr = (x: number, y: number, z: number) => w.place(P(x, y, z), 'redstone_wire');
  const rp = (x: number, y: number, z: number, f: Dir, d: number) => w.place(P(x, y, z), 'repeater', { facing: f, delay: d });
  w.place(P(0, 0, 0), 'sticky_piston', { facing: 'up' });
  w.place(P(0, 1, 0), 'sticky_piston', { facing: 'up' });
  w.place(P(0, 0, -1), 'observer', { facing: 'south' });
  wr(0, 0, 2); rp(0, 0, 1, 'south', 1); rp(1, 0, 2, 'east', 1);
  rp(0, 0, 4, 'south', 3); rp(0, 0, 3, 'south', 3);
  wr(0, 0, 5); wr(1, 0, 5); wr(2, 0, 5); wr(2, 0, 4); wr(2, 0, 3); wr(2, 0, 2);
  wr(2, 1, 1); wr(2, 2, 0); rp(1, 2, 0, 'east', 4);
  for (const [x, y, z] of [[0, 1, -2], [-1, 1, -2], [-2, 1, -2], [-2, 1, -1], [-2, 1, 0]]) wr(x, y, z);
  rp(-1, 1, 0, 'west', 1);

  // ---- feeder staircase from the floor down to the extender's input (1,-3,6) ----
  wire(1, -3, 7); wire(1, -2, 8); wire(1, -1, 9); wire(1, 0, 10);
  wire(1, 1, 11); rep(2, 1, 11, 'east', 1);   // input from the east, outputs west toward the staircase
  for (let z = 5; z <= 11; z++) if (z !== 7) wire(3, 1, z);
  rep(3, 1, 7, 'north', 1);   // input from the north, outputs south (refreshes the signal)

  // ---- bus on the floor behind the door ----
  for (const x of [5, 4, 3]) wire(x, 1, 4);
  rep(2, 1, 4, 'east', 1);    // input from the east, outputs west along the bus
  for (let x = 1; x >= -3; x--) wire(x, 1, 4);
  wire(5, 1, 3); wire(5, 1, 2);                       // right stub input
  rep(5, 1, 1, 'south', 1);
  wire(-3, 1, 3); wire(-3, 1, 2);                     // left stub input
  rep(-3, 1, 1, 'south', 1);

  // ---- top piston: tower of two torches carries the signal up to y=5, then dust over the doorway ----
  rep(-4, 1, 3, 'east', 1);                           // from the bus, outputs west into the first tower block
  w.place([-5, 2, 3], 'redstone_torch');              // floor torch on tower block 1 (off when the bus is on)
  w.place([-5, 4, 3], 'redstone_torch');              // floor torch on tower block 2 (on again)
  for (let x = -4; x <= 1; x++) wire(x, 5, 3);        // dust along y=5 from the top tower block
  wire(1, 5, 2);
  rep(1, 5, 1, 'south', 1);                           // into the top piston

  // ---- lever + inverter: torch keeps the bus powered; lever ON powers its block and shuts it off ----
  w.place([6, 1, 4], 'redstone_wall_torch', { facing: 'west' });
  w.place([7, 2, 4], 'lever', { face: 'floor' });

  const door: Pos[] = [];
  for (const x of [0, 1, 2]) for (const y of [1, 2, 3]) door.push([x, y, 0]);
  return { lever: [7, 2, 4], door };
}

const isClosed = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'stone');
const isOpen = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'air');

/** Front view (x across, y up) of one z plane. */
export function elevation(w: World, z: number, x0 = -6, x1 = 8, y0 = -4, y1 = 7): string {
  const sym = (t: string, p: Record<string, any>) =>
    t === 'air' ? '.' : t === 'obsidian' ? 'X' : t === 'stone' ? '#' : t === 'slime_block' ? 's' : t === 'glass' ? 'g' :
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
  const { lever, door } = buildDoor3(w);
  w.run(120);
  console.log('closed after settling:', isClosed(w, door));
  let closeT = 0, openT = 0;
  for (let i = 0; i < 3; i++) {
    w.use(lever); let t = 0; while (!isOpen(w, door) && t < 200) { w.step(); t++; } openT = t; w.run(60);
    w.use(lever); t = 0; while (!isClosed(w, door) && t < 200) { w.step(); t++; } closeT = t; w.run(60);
  }
  console.log(`cycle x3 ok; open ${openT} ticks, close ${closeT} ticks`);
  const closedView = elevation(w, 0);
  const out = exportSchem(w);
  writeFileSync('examples/piston-door-3x3.schem', out.buffer);
  console.log('exported size', out.size.join('x'), 'origin', out.origin.join(','), 'lever at schematic', lever.map((v, i) => v - out.origin[i]).join(','));
  w.use(lever); w.run(60);
  const openView = elevation(w, 0);
  writeFileSync('examples/piston-door-3x3.views.txt', `CLOSED (front, z=0)\n${closedView}\n\nOPEN (front, z=0)\n${openView}\n`);
  console.log(closedView + '\n\n' + openView);
}
