/**
 * LAB 5: WATER. The item lifts of the gear set rely on water physics that were only modelled from vanilla rules (never recorded).
 * Cells: a dropper next to L0 fires one item into a water column when the lever goes ON (the dropper is powered directly by L0).
 *  W.plain      plain water column (obsidian floor): items rise by buoyancy only
 *  W.plain.soul plain water source column over soul sand: does NOT become a bubble column when pasted (lab 1), how fast do items rise
 *  W.bubble     real bubble_column blocks over soul sand: rise speed
 *  W.liftTop    the lift top used in the gear set: bubble column, lid, flowing spill cell, hopper below it, chest: does the item arrive, how long does it take
 *  W.flow       item thrown onto a short water stream (source + flowing levels 1..4): how fast does the water carry it
 * Item entities are logged every tick (tools/gearrec.sc `I` lines); the simulator's item physics (src/items3d.ts) is compared with the real positions.
 * Build: `npx tsx examples/lab5.ts` -> examples/lab5.schem + examples/lab5-cells.txt. Procedure: knowledge/LAB5.md.
 */
import { World } from '../src/world.ts';
import { buildGrid, exportTimingLab, probe, inv, type Def, type Probe, type Rel } from './lab-core.ts';
import type { Pos } from '../src/dirs.ts';

const GEN = ['powered', 'triggered', 'enabled', 'level', 'drag', 'type'];
const defs: Def[] = [];
const add = (id: string, group: string, desc: string, span: number, build: (w: World, at: Rel) => Probe[]) => defs.push({ id, group, desc, build, span });
const P = (name: string, pos: Pos) => probe(name, pos, ...GEN);
const stone = (w: World, at: Rel) => w.setRaw(at(0, 0, 0), 'stone');
const glass = (w: World, p: Pos) => w.setRaw(p, 'glass');

/** dropper next to L0 (fires when the lever goes ON) facing the water column at x=2; the column walls. */
function column(w: World, at: Rel, h: number, kind: 'water' | 'bubble', floor: 'obsidian' | 'soul_sand', glassTop = h - 1) {
  stone(w, at);
  w.setRaw(at(1, 0, 0), 'dropper', { facing: 'east', triggered: false }); w.setItem(at(1, 0, 0), 0, { id: 'diamond', count: 1 });
  w.setRaw(at(2, -1, 0), floor);
  for (let y = 0; y < h; y++) {
    w.setRaw(at(2, y, 0), kind === 'bubble' ? 'bubble_column' : 'water', kind === 'bubble' ? { drag: false } : { level: 0 });
    glass(w, at(2, y, -1)); glass(w, at(2, y, 1)); glass(w, at(3, y, 0));
    if (y > 0) glass(w, at(1, y, 0));
  }
  void glassTop;
}
add('W.plain', 'water', 'water source column (6 high) on obsidian: an item thrown in by a dropper rises by buoyancy', 1, (w, at) => {
  column(w, at, 6, 'water', 'obsidian');
  return [inv('dropper', at(1, 0, 0)), P('water bottom', at(2, 0, 0)), P('water top', at(2, 5, 0)), P('above top', at(2, 6, 0))];
});
add('W.plain.soul', 'water', 'water source column (6 high) on SOUL SAND, plain water (no bubble column): how fast does the item rise', 1, (w, at) => {
  column(w, at, 6, 'water', 'soul_sand');
  return [inv('dropper', at(1, 0, 0)), P('water bottom', at(2, 0, 0)), P('water top', at(2, 5, 0))];
});
add('W.bubble', 'water', 'real bubble_column blocks (6 high) on soul sand: rise speed of the item', 1, (w, at) => {
  column(w, at, 6, 'bubble', 'soul_sand');
  return [inv('dropper', at(1, 0, 0)), P('column bottom', at(2, 0, 0)), P('column top', at(2, 5, 0)), P('above top', at(2, 6, 0))];
});

add('W.liftTop', 'water', 'the lift top of the gear set: bubble column (5), wool lid, flowing spill cell over a hopper that feeds a chest', 2, (w, at) => {
  column(w, at, 5, 'bubble', 'soul_sand');
  // top: lid over the column and the spill cell; the spill cell (flowing water level 1) sits east of the top cell, a hopper one level below it
  w.setRaw(at(2, 5, 0), 'white_wool'); w.setRaw(at(3, 5, 0), 'white_wool');
  w.setRaw(at(3, 4, 0), 'water', { level: 1 }); glass(w, at(3, 4, -1)); glass(w, at(3, 4, 1)); glass(w, at(4, 4, 0));
  w.setRaw(at(3, 3, 0), 'hopper', { facing: 'east', enabled: true }); w.setRaw(at(4, 3, 0), 'chest', { facing: 'north' });
  return [inv('dropper', at(1, 0, 0)), P('top cell', at(2, 4, 0)), P('spill cell', at(3, 4, 0)), inv('hopper', at(3, 3, 0)), inv('chest', at(4, 3, 0))];
});

add('W.flow', 'water', 'item thrown onto a stream: source + flowing levels 1..4 on an obsidian floor, glass walls', 2, (w, at) => {
  stone(w, at);
  w.setRaw(at(1, 0, 0), 'dropper', { facing: 'east', triggered: false }); w.setItem(at(1, 0, 0), 0, { id: 'diamond', count: 1 });
  for (let x = 2; x <= 7; x++) { w.setRaw(at(x, -1, 0), 'obsidian'); glass(w, at(x, 0, -1)); glass(w, at(x, 0, 1)); }
  w.setRaw(at(2, 0, 0), 'water', { level: 0 });
  for (let k = 1; k <= 4; k++) w.setRaw(at(2 + k, 0, 0), 'water', { level: k });
  glass(w, at(7, 0, 0));
  return [inv('dropper', at(1, 0, 0)), P('source', at(2, 0, 0)), P('level 1', at(3, 0, 0)), P('level 4', at(6, 0, 0)), P('end', at(7, 0, 0))];
});

export function buildLab5(w: World) { return buildGrid(w, defs, 7, 9); }
if (import.meta.url === `file://${process.argv[1]}`) exportTimingLab('lab5', defs, 7, 9, { items: true });
