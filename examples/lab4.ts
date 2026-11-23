/**
 * LAB 4: bigger mechanisms. The gated dropper circuit that is used in the item lifts (the user's circuit, real-game checked for working, here for its TIMING),
 * a hopper clock (2 hoppers + comparator), crafters (delay, output), and slime chains at the 12-block limit (slime + glued blocks all count).
 * Same grid / procedure as the other labs (knowledge/LAB4.md). Rows are 13 apart (the ring is 11 deep).
 * Build: `npx tsx examples/lab4.ts` -> examples/lab4.schem + examples/lab4-cells.txt.
 */
import { World } from '../src/world.ts';
import { buildGrid, exportTimingLab, probe, inv, type Def, type Probe, type Rel } from './lab-core.ts';
import type { Pos } from '../src/dirs.ts';

const GEN = ['extended', 'powered', 'lit', 'triggered', 'enabled', 'power', 'locked', 'type'];
const defs: Def[] = [];
const add = (id: string, group: string, desc: string, span: number, build: (w: World, at: Rel) => Probe[]) => defs.push({ id, group, desc, build, span });
const P = (name: string, pos: Pos) => probe(name, pos, ...GEN);
const stone = (w: World, at: Rel) => w.setRaw(at(0, 0, 0), 'stone');

// ---- the gated dropper circuit (examples/gear-lift.ts gatedRing), placed raw. D = the dropper, m = 1: B on the west side. The ring runs SOUTH of the dropper here (flipZ),
// the comparator K reading the dropper sits next to L0, so the lever's block update starts it. Component `flow` = direction the signal leaves.
const OPP: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
function ringRaw(w: World, D: Pos, m: number, flipZ: boolean): { c2: Pos; rd: Pos; k: Pos; b: Pos } {
  const at = (dx: number, dz: number): Pos => [D[0] + m * dx, D[1], D[2] + (flipZ ? -dz : dz)];
  const fl = (f: string) => (flipZ && (f === 'north' || f === 'south') ? OPP[f] : f);
  const rep = (p: Pos, flow: string, delay: number) => w.setRaw(p, 'repeater', { facing: OPP[fl(flow)], delay, powered: false });
  const cmp = (p: Pos, flow: string, mode: string) => w.setRaw(p, 'comparator', { facing: OPP[fl(flow)], mode, powered: false });
  w.setRaw(at(-1, 0), 'cyan_wool');
  cmp(at(0, -1), 'north', 'compare'); rep(at(0, -2), 'north', 1);
  for (const [dx, dz] of [[0, -3], [1, -3], [1, -6], [0, -6]]) w.setRaw(at(dx, dz), 'redstone_wire');
  rep(at(1, -4), 'north', 4); rep(at(1, -5), 'north', 4); rep(at(0, -7), 'north', 1);
  cmp(at(0, -8), 'north', 'subtract'); rep(at(0, -9), 'north', 1);
  rep(at(-1, -8), m > 0 ? 'east' : 'west', 1);
  for (const [dx, dz] of [[0, -10], [-1, -10], [-2, -10], [-2, -9], [-2, -8], [-2, -7], [-2, -6], [-2, -5], [-2, -4], [-2, -3], [-2, -2], [-1, -2]]) w.setRaw(at(dx, dz), 'redstone_wire');
  rep(at(-1, -1), 'south', 1);
  return { c2: at(0, -8), rd: at(-1, -1), k: at(0, -1), b: at(-1, 0) };
}
add('K.gated', 'clock', 'the lift\'s gated dropper circuit: a dropper with 4 items under a chest; L0 (next to the comparator) starts it; one item per pulse', 1, (w, at) => {
  stone(w, at);
  const D = at(-1, 0, -1);
  w.setRaw(D, 'dropper', { facing: 'up', triggered: false }); w.setItem(D, 0, { id: 'cobblestone', count: 4 });
  w.setRaw([D[0], D[1] + 1, D[2]], 'chest', { facing: 'north' });
  const r = ringRaw(w, D, 1, true);
  return [inv('dropper', D), inv('chest', [D[0], D[1] + 1, D[2]]), P('dropper', D), P('comparator K', r.k), P('C2 (oscillator)', r.c2), P('driver Rd', r.rd)];
});

// ---- hopper clock: two hoppers pass one item back and forth (locked by a torch until the lever), a comparator reads the first ----
add('K.hopperclock', 'clock', 'two hoppers pass one item back and forth, comparator on the first (the old lift clock); torch-locked until the lever', 1, (w, at) => {
  stone(w, at);
  w.setRaw(at(1, 0, 0), 'redstone_wall_torch', { facing: 'east', lit: true });
  w.setRaw(at(2, 0, 0), 'hopper', { facing: 'south', enabled: false }); w.setItem(at(2, 0, 0), 0, { id: 'stick', count: 1 });
  w.setRaw(at(2, 0, 1), 'hopper', { facing: 'north', enabled: true });
  w.setRaw(at(3, 0, 0), 'comparator', { facing: 'west', mode: 'compare', powered: false }); w.setRaw(at(4, 0, 0), 'redstone_wire');
  return [P('hopper 1', at(2, 0, 0)), inv('hopper 1', at(2, 0, 0)), inv('hopper 2', at(2, 0, 1)), P('comparator', at(3, 0, 0)), P('dust', at(4, 0, 0))];
});

// ---- crafters (powered by L0; output into a chest in front) ----
add('C.crafter.sticks', 'crafter', 'crafter with 2 planks (slots 1,4) next to L0: when and what does it craft', 1, (w, at) => {
  stone(w, at); w.setRaw(at(1, 0, 0), 'crafter', { facing: 'east', triggered: false }); w.setRaw(at(2, 0, 0), 'chest', { facing: 'north' });
  for (const s of [1, 4]) w.setItem(at(1, 0, 0), s, { id: 'oak_planks', count: 4 });
  return [P('crafter', at(1, 0, 0)), inv('crafter', at(1, 0, 0)), inv('chest', at(2, 0, 0))];
});
add('C.crafter.pickaxe', 'crafter', 'crafter with 3 diamonds + 2 sticks (a pickaxe) next to L0', 1, (w, at) => {
  stone(w, at); w.setRaw(at(1, 0, 0), 'crafter', { facing: 'east', triggered: false }); w.setRaw(at(2, 0, 0), 'chest', { facing: 'north' });
  for (const s of [0, 1, 2]) w.setItem(at(1, 0, 0), s, { id: 'diamond', count: 1 });
  for (const s of [4, 7]) w.setItem(at(1, 0, 0), s, { id: 'stick', count: 1 });
  return [P('crafter', at(1, 0, 0)), inv('crafter', at(1, 0, 0)), inv('chest', at(2, 0, 0))];
});

// ---- slime chains: a slime column with a stone glued to the side of each slime. All of them count towards the 12-block limit ----
for (const [id, slimes, stones] of [['S.chain12', 6, 6], ['S.chain13', 7, 6]] as const) {
  add(id, 'push limit', `plain piston pushes up a slime column (${slimes} slime) with ${stones} stones glued to it: ${slimes + stones} blocks`, 1, (w, at) => {
    stone(w, at); w.setRaw(at(1, -1, 0), 'obsidian'); w.setRaw(at(1, 0, 0), 'piston', { facing: 'up', extended: false });
    for (let y = 1; y <= slimes; y++) w.setRaw(at(1, y, 0), 'slime_block');
    for (let y = 1; y <= stones; y++) w.setRaw(at(2, y, 0), 'stone');
    return [P('piston', at(1, 0, 0)), P('slime bottom', at(1, 1, 0)), P('slime top', at(1, slimes, 0)), P('above', at(1, slimes + 1, 0)), P('stone bottom', at(2, 1, 0))];
  });
}

export function buildLab4(w: World) { return buildGrid(w, defs, 7, 13); }
if (import.meta.url === `file://${process.argv[1]}`) exportTimingLab('lab4', defs, 7, 13);
