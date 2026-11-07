/** Shared layout for the lab builds: a grid of cells, each fed by a stub repeater from one lever bus. See examples/lab.ts / lab2.ts. */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { toBlockState } from '../src/export.ts';
import type { Pos } from '../src/dirs.ts';

export interface Probe { name: string; pos: Pos; obs: string[]; inv?: boolean }
export interface Cell { id: string; group: string; desc: string; origin: Pos; probes: Probe[] }
export type Rel = (dx: number, dy: number, dz: number) => Pos;
export type Build = (w: World, at: Rel) => Probe[];
export interface Def { id: string; group: string; desc: string; build: Build; /** grid columns the cell occupies (wide cells) */ span?: number }

export const FLOOR_Y = -3;
export const STEP = 7, ROW_DZ = 9;
export const probe = (name: string, pos: Pos, ...obs: string[]): Probe => ({ name, pos, obs });
/** probe of a container's inventory (slot:item x count) */
export const inv = (name: string, pos: Pos): Probe => ({ name, pos, obs: [], inv: true });

export function buildGrid(w: World, defs: Def[], PER_ROW = 17, rowDz = ROW_DZ): { lever: Pos; cells: Cell[]; box: [Pos, Pos] } {
  // place cells in rows of PER_ROW columns; a wide cell takes `span` columns
  const slots: { row: number; col: number }[] = [];
  { let row = 0, col = 0; for (const d of defs) { const sp = d.span ?? 1; if (col + sp > PER_ROW) { row++; col = 0; } slots.push({ row, col }); col += sp; } }
  const rows = (slots.length ? slots[slots.length - 1].row : 0) + 1;
  const xMax = 6 + STEP * PER_ROW + 6, zMax = (rows - 1) * rowDz + 8;
  const rowHasCells = (r: number) => slots.some((q) => q.row === r);
  void rowHasCells;
  for (let x = -4; x <= xMax; x++) for (let z = -4; z <= zMax; z++) w.setRaw([x, FLOOR_Y, z], 'obsidian');
  const lever: Pos = [-1, 1, 0];
  w.setRaw([-1, 0, 0], 'obsidian');
  w.setRaw(lever, 'lever', { face: 'floor' });
  const supportDust = (p: Pos) => { w.setRaw([p[0], 0, p[2]], 'obsidian'); w.setRaw(p, 'redstone_wire'); };
  // spine along +z at x=0 (the lever feeds its start)
  let srun = 0;                                                      // a repeater every 7 cells, never at a row bus (z % ROW_DZ == 0: the bus starts next to the spine)
  for (let z = 0; z <= (rows - 1) * rowDz; z++) {
    srun++;
    if (srun >= 7 && z % rowDz !== 0) { w.setRaw([0, 0, z], 'obsidian'); w.setRaw([0, 1, z], 'repeater', { facing: 'north', delay: 1 }); srun = 0; } else supportDust([0, 1, z]);
  }
  const cells: Cell[] = [];
  defs.forEach((d, k) => {
    const { row, col } = slots[k];
    const z0 = row * rowDz, x = 6 + STEP * col;
    if (k === 0 || slots[k - 1].row !== row) {
      let run = 0;                                                    // a repeater every 7 cells, never in a stub column (the stub reads the dust above it)
      for (let bx = 1; bx <= 6 + STEP * PER_ROW; bx++) {
        run++;
        if (run >= 7 && (bx - 6) % STEP !== 0) { w.setRaw([bx, 0, z0], 'obsidian'); w.setRaw([bx, 1, z0], 'repeater', { facing: 'west', delay: 1 }); run = 0; } else supportDust([bx, 1, z0]);
      }
    }
    w.setRaw([x, 0, z0 + 1], 'obsidian');
    w.setRaw([x, 1, z0 + 1], 'repeater', { facing: 'north', delay: 1 });
    const at: Rel = (dx, dy, dz) => [x + dx, 1 + dy, z0 + 2 + dz];
    const probes = d.build(w, at);
    cells.push({ id: d.id, group: d.group, desc: d.desc, origin: at(0, 0, 0), probes });
  });
  // a paste has no shape updates: give every dust its final connections, as the real game would draw them (otherwise the stored sides are stale)
  const ww = w as any;
  for (const b of w.listBlocks()) {
    if (b.type !== 'redstone_wire') continue;
    let sides = ww.wireRegulate({ north: 'none', east: 'none', south: 'none', west: 'none' }, b.pos);
    if (ww.sidesDot(sides)) sides = ww.sidesCross();
    w.setRaw(b.pos, 'redstone_wire', { ...b.props, ...sides });
  }
  // dust, repeaters, comparators and floor torches need a block under them (a floating one pops at the first update): put obsidian under any that float
  for (const b of w.listBlocks()) {
    if (!['redstone_wire', 'repeater', 'comparator', 'redstone_torch'].includes(b.type)) continue;
    const below: Pos = [b.pos[0], b.pos[1] - 1, b.pos[2]];
    if (w.get(below).type === 'air') w.setRaw(below, 'obsidian');
  }
  return { lever, cells, box: [[-5, FLOOR_Y, -5], [xMax + 1, 6, zMax + 1]] };
}

/** what a probe reads: vanilla block name + the listed properties as strings */
export function observe(w: World, p: Probe): string {
  const b = w.get(p.pos);
  if (p.inv) {
    const items = ((w.items(p.pos) ?? []) as any[]).map((x, i) => (x ? `${i}:${x.id}x${x.count}` : '')).filter(Boolean);
    return '[' + items.join(',') + ']';
  }
  if (b.type === 'air') return 'air';
  if (b.type === 'moving_piston') return 'moving_piston';                       // its props are not compared (the real one shows type=normal for a sticky head)
  const name = /^minecraft:([a-z_0-9]+)/.exec(toBlockState(b))![1];
  const vals = p.obs.map((k) => `${k}=${k === 'locked' && b.type === 'repeater' ? String((w as any).diodeLocked(p.pos, b)) : b.p[k] === undefined ? '-' : String(b.p[k])}`);
  return [name, ...vals].join(' ');
}


/** Build a timing lab, run it in the simulator (lever ON, 100 ticks, lever OFF, 100 ticks) and write examples/<name>.schem + examples/<name>-cells.txt (probes + the per-tick events). */
export function exportTimingLab(name: string, defs: Def[], perRow: number, rowDz = ROW_DZ): void {
  const w = new World();
  const lab = buildGrid(w, defs, perRow, rowDz);
  w.run(40);
  const flat = lab.cells.flatMap((c) => c.probes.map((p) => ({ cell: c.id, p })));
  const PH = 100;
  const cur = () => flat.map((f) => observe(w, f.p));
  const init = cur();
  const trace: { phase: string; t: number; i: number; v: string }[] = [];
  const falling: { phase: string; t: number; pos: number[][] }[] = [];
  const run = (phase: string) => {
    let last = cur();
    for (let t = 1; t <= PH; t++) {
      w.run(1);
      if (w.falling.length) falling.push({ phase, t, pos: w.falling.map((f: any) => [f.x, f.y, f.z, f.vy]).sort() });
      const now = cur();
      for (let i = 0; i < now.length; i++) if (now[i] !== last[i]) trace.push({ phase, t, i, v: now[i] });
      last = now;
    }
  };
  w.use(lab.lever); run('on');
  w.use(lab.lever); run('off');
  const cells = lab.cells.map((c) => ({ id: c.id, group: c.group, desc: c.desc, origin: c.origin, probes: c.probes.map((p) => ({ name: p.name, pos: p.pos, obs: p.obs, inv: !!p.inv })) }));
  const probeEvents = flat.map((f, i) => ({ cell: f.cell, name: f.p.name, init: init[i], on: trace.filter((t) => t.i === i && t.phase === 'on').map((t) => [t.t, t.v]), off: trace.filter((t) => t.i === i && t.phase === 'off').map((t) => [t.t, t.v]) }));
  const w2 = new World(); buildGrid(w2, defs, perRow, rowDz);               // the schematic is the FRESH lab (the world above is after both flicks)
  const fresh = exportSchem(w2);
  writeFileSync(`examples/${name}.schem`, fresh.buffer);
  writeFileSync(`examples/${name}-cells.txt`, JSON.stringify({ lever: lab.lever, box: lab.box, schemOrigin: fresh.origin, cells, events: probeEvents, falling }, null, 0));
  console.log(`cells ${cells.length}, probes ${flat.length}, blocks ${w2.listBlocks().length}, schematic ${fresh.size.join('x')} origin ${fresh.origin.join(',')}, lever ${lab.lever.join(',')}, box ${lab.box.map((b) => b.join(',')).join(' .. ')}`);
}
