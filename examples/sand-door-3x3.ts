/**
 * 3x3 SAND door (door blocks are falling blocks). Run: npx tsx examples/sand-door-3x3.ts
 *
 * Same mechanism as examples/piston-door-3x3.ts (sim only) but the door blocks are sand where gravity allows it:
 *  - left / right columns (x=0, x=2): 3 sand each, glued to slime in the wall, one sticky piston pulls them 1 block sideways
 *    (they rest on the obsidian floor before and after)
 *  - top centre (1,3): STONE, pulled up 1 by a sticky piston (a sand block there would fall straight back into the doorway)
 *  - lower centre: sand (1,1),(1,2) ON A STONE SUPPORT (1,0): the sand has to stand on something while the door is closed (sand
 *    glued to slime still falls: gravity ignores glue), so the support is part of the moving unit. Three slime blocks behind
 *    them are pulled DOWN 2 by the double piston extender (buried one block deeper than in the plain door), the support goes
 *    down to y=-2 and the two sand blocks end up at y=-1,0 (in the floor, standing on the support).
 *  - control: lever -> torch inverter -> bus dust behind the door (as in the plain door)
 * Door cells: x=0..2, y=1..3 at z=0. Lever ON = open, OFF = closed.
 */
import { World } from '../src/world.ts';
import type { Dir, Pos } from '../src/dirs.ts';

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

export function buildSandDoor3(w: World): { lever: Pos; door: Pos[] } {
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
  carve(1, 1, -2, 0, 0, 1);      // where the lower centre unit (support + two sand + three slime) rests when open
  carve(-3, -3, 1, 1, 1, 1);     // repeater stubs inside the wall
  carve(5, 5, 1, 1, 1, 1);
  carve(1, 1, 5, 5, 1, 1);
  free.add(key(1, 0, 10)); free.add(key(1, 0, 11)); // floor holes for the dust staircase

  // ---- wall (3 thick) and floor, all obsidian ----
  for (let x = -8; x <= 10; x++) for (let y = 0; y <= 8; y++) for (let z = -1; z <= 1; z++) if (!free.has(key(x, y, z))) ob(x, y, z);
  for (let x = -8; x <= 10; x++) for (let z = 2; z <= 13; z++) if (!free.has(key(x, 0, z))) ob(x, 0, z);
  w.place([1, 0, 10], 'glass'); // non-conducting cover so the dust can climb the staircase under it

  // ---- supports for the circuits (obsidian, never stone: slime would glue stone) ----
  const Pr = (x: number, y: number, z: number): Pos => [x + 1, y - 4, z + 1]; // extender circuit origin (1,-4,1) (one deeper than the plain door)
  const obr = (x: number, y: number, z: number) => w.place(Pr(x, y, z), 'obsidian');
  for (const [x, z] of [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 5], [2, 5], [2, 4], [2, 3], [2, 2]]) obr(x, -1, z);
  obr(2, 0, 1); obr(2, 1, 0); obr(1, 1, 0); obr(-1, 0, 0);
  for (const [x, z] of [[0, -2], [-1, -2], [-2, -2], [-2, -1], [-2, 0]]) obr(x, 0, z);
  for (const [x, y, z] of [
    // dust staircase from the floor down to the extender
    [1, -5, 7], [1, -4, 8], [1, -3, 9], [1, -2, 10], [1, -1, 11],
    // torch inverter support
    [7, 1, 4],
    // torch tower
    [-5, 1, 3], [-5, 3, 3], [-5, 5, 3],
  ] as [number, number, number][]) ob(x, y, z);
  // support blocks under the top run of dust
  for (let x = -4; x <= 1; x++) ob(x, 4, 3);
  ob(1, 4, 2);

  // ---- the door ----
  for (const x of [0, 1, 2]) for (const y of [1, 2, 3]) w.place([x, y, 0], x === 1 && y === 3 ? 'stone' : 'sand');
  w.place([1, 0, 0], 'stone');                       // support under the lower centre sand (moves down with it)
  for (const y of [1, 2, 3]) { w.place([-1, y, 0], 'slime_block'); w.place([3, y, 0], 'slime_block'); }
  w.place([1, 0, 1], 'slime_block'); w.place([1, 1, 1], 'slime_block'); w.place([1, 2, 1], 'slime_block');
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
  wire(1, -4, 7); wire(1, -3, 8); wire(1, -2, 9); wire(1, -1, 10); wire(1, 0, 11);
  wire(1, 1, 12); rep(2, 1, 12, 'east', 1);   // input from the east, outputs west toward the staircase
  for (let z = 5; z <= 12; z++) if (z !== 7) wire(3, 1, z);
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

const sandAt = (w: World, p: Pos) => w.get(p).type === 'sand';
export const isClosed = (w: World, door: Pos[]) => door.every((p) => ['stone', 'sand'].includes(w.get(p).type));
export const isOpen = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'air');
export const countType = (w: World, t: string) => w.listBlocks().filter((b) => b.type === t).length;

/** Front view (x across, y up) of one z plane. */
export function elevation(w: World, z: number, x0 = -6, x1 = 8, y0 = -5, y1 = 7): string {
  const sym = (t: string, p: Record<string, any>) =>
    t === 'air' ? '.' : t === 'obsidian' ? 'X' : t === 'stone' ? '#' : t === 'sand' ? 'S' : t === 'slime_block' ? 's' : t === 'glass' ? 'g' :
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
  const { lever, door } = buildSandDoor3(w);
  w.run(120);
  console.log('closed after settling:', isClosed(w, door), 'sand', countType(w, 'sand'), 'falling', w.falling.length);
  let closeT = 0, openT = 0;
  for (let i = 0; i < 3; i++) {
    w.use(lever); let t = 0; while (!isOpen(w, door) && t < 300) { w.step(); t++; } openT = t; w.run(80);
    w.use(lever); t = 0; while (!isClosed(w, door) && t < 300) { w.step(); t++; } closeT = t; w.run(80);
  }
  console.log(`cycle x3: open ${openT} ticks, close ${closeT} ticks, sand ${countType(w, 'sand')}, falling ${w.falling.length}`);
  const closedView = elevation(w, 0);
  w.use(lever); w.run(100);
  console.log(closedView + '\n\n' + elevation(w, 0));
}
