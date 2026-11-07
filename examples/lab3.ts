/**
 * LAB 3: observers, comparator levels, hopper chains, the 12-block push limit, two pistons pushing one block, what a piston head destroys,
 * pistons pushing pistons, sand glued to slime. Same grid / procedure as lab 2 (see knowledge/LAB3.md).
 * Build: `npx tsx examples/lab3.ts` -> examples/lab3.schem + examples/lab3-cells.txt (probes + the simulator's per-tick events).
 */
import { World } from '../src/world.ts';
import { buildGrid, exportTimingLab, probe, inv, type Def, type Probe, type Rel } from './lab-core.ts';
import type { Pos } from '../src/dirs.ts';

const GEN = ['extended', 'powered', 'lit', 'triggered', 'enabled', 'power', 'locked', 'type'];
const defs: Def[] = [];
const add = (id: string, group: string, desc: string, span: number, build: (w: World, at: Rel) => Probe[]) => defs.push({ id, group, desc, build, span });
const P = (name: string, pos: Pos) => probe(name, pos, ...GEN);
const stone = (w: World, at: Rel) => w.setRaw(at(0, 0, 0), 'stone');
const lamp = (w: World, p: Pos) => w.setRaw(p, 'redstone_lamp', { lit: false });
const obs = (w: World, p: Pos, facing: string) => w.setRaw(p, 'observer', { facing, powered: false });

// ---- observers ----
add('O.chain3', 'observer', 'lamp next to L0 -> observer -> observer -> observer -> lamp (each watches the previous one)', 2, (w, at) => {
  stone(w, at); lamp(w, at(1, 0, 0)); obs(w, at(2, 0, 0), 'west'); obs(w, at(3, 0, 0), 'west'); obs(w, at(4, 0, 0), 'west'); lamp(w, at(5, 0, 0));
  return [P('lamp A', at(1, 0, 0)), P('obs 1', at(2, 0, 0)), P('obs 2', at(3, 0, 0)), P('obs 3', at(4, 0, 0)), P('lamp B', at(5, 0, 0))];
});
add('O.piston', 'observer', 'observer watching the head cell of a piston (extends when the lever goes ON)', 2, (w, at) => {
  stone(w, at); w.setRaw(at(1, 0, 0), 'piston', { facing: 'east', extended: false }); obs(w, at(3, 0, 0), 'west'); lamp(w, at(4, 0, 0));
  return [P('piston', at(1, 0, 0)), P('head cell', at(2, 0, 0)), P('observer', at(3, 0, 0)), P('lamp', at(4, 0, 0))];
});
add('O.dust', 'observer', 'observer watching dust that is powered by L0', 1, (w, at) => {
  stone(w, at); w.setRaw(at(1, 0, 0), 'redstone_wire'); obs(w, at(2, 0, 0), 'west'); lamp(w, at(3, 0, 0));
  return [P('dust', at(1, 0, 0)), P('observer', at(2, 0, 0)), P('lamp', at(3, 0, 0))];
});
add('O.moved', 'observer', 'observer pushed by a piston: does moving it make it pulse?', 1, (w, at) => {
  stone(w, at); w.setRaw(at(1, 0, 0), 'piston', { facing: 'east', extended: false }); obs(w, at(2, 0, 0), 'north'); lamp(w, at(2, 0, 1)); lamp(w, at(3, 0, 1));
  return [P('piston', at(1, 0, 0)), P('observer start', at(2, 0, 0)), P('observer pushed', at(3, 0, 0)), P('lamp A', at(2, 0, 1)), P('lamp B', at(3, 0, 1))];
});

// ---- comparator levels: a hopper (locked by a torch until the lever) feeds a dropper full of swords; a comparator reads it ----
add('C.levels', 'comparator', '9 swords (stack size 1) move one by one into a dropper read by a comparator: signal 2,3,5,6,8,9,11,12,14', 2, (w, at) => {
  stone(w, at);
  w.setRaw(at(1, 0, 0), 'redstone_wall_torch', { facing: 'east', lit: true });
  w.setRaw(at(2, 0, 0), 'hopper', { facing: 'east', enabled: false }); w.setRaw(at(2, 1, 0), 'chest', { facing: 'north' });
  for (let i = 0; i < 9; i++) w.setItem(at(2, 1, 0), i, { id: 'diamond_sword', count: 1 });
  w.setRaw(at(3, 0, 0), 'dropper', { facing: 'north', triggered: false });
  w.setRaw(at(4, 0, 0), 'comparator', { facing: 'west', mode: 'compare', powered: false }); w.setRaw(at(5, 0, 0), 'redstone_wire');
  return [P('hopper', at(2, 0, 0)), inv('dropper', at(3, 0, 0)), P('comparator', at(4, 0, 0)), P('dust (power = signal)', at(5, 0, 0))];
});

// ---- hopper chain ----
add('H.chain', 'hopper', 'torch-locked hopper -> hopper -> hopper -> chest: 5 cobblestone, how fast do they travel', 2, (w, at) => {
  stone(w, at);
  w.setRaw(at(1, 0, 0), 'redstone_wall_torch', { facing: 'east', lit: true });
  w.setRaw(at(2, 0, 0), 'hopper', { facing: 'east', enabled: false }); w.setRaw(at(2, 1, 0), 'chest', { facing: 'north' }); w.setItem(at(2, 1, 0), 0, { id: 'cobblestone', count: 5 });
  w.setRaw(at(3, 0, 0), 'hopper', { facing: 'east', enabled: true }); w.setRaw(at(4, 0, 0), 'hopper', { facing: 'east', enabled: true }); w.setRaw(at(5, 0, 0), 'chest', { facing: 'north' });
  return [P('hopper 1', at(2, 0, 0)), inv('chest', at(2, 1, 0)), inv('hopper 1', at(2, 0, 0)), inv('hopper 2', at(3, 0, 0)), inv('hopper 3', at(4, 0, 0)), inv('target', at(5, 0, 0))];
});

// ---- the 12-block push limit (vertical column, plain piston facing up) ----
for (const n of [12, 13]) {
  add(`S.limit${n}`, 'push limit', `plain piston pushes a column of ${n} stone blocks up (limit is 12)`, 1, (w, at) => {
    stone(w, at); w.setRaw(at(1, -1, 0), 'obsidian'); w.setRaw(at(1, 0, 0), 'piston', { facing: 'up', extended: false });
    for (let y = 1; y <= n; y++) w.setRaw(at(1, y, 0), 'stone');
    return [P('piston', at(1, 0, 0)), P('bottom', at(1, 1, 0)), P('top', at(1, n, 0)), P('above top', at(1, n + 1, 0))];
  });
}
// ---- two pistons push the same stone at the same moment (west and south) ----
add('P.two', 'update order', 'two pistons (from the west and from the south) push the same stone in the same tick', 1, (w, at) => {
  stone(w, at);
  w.setRaw(at(1, 0, 0), 'piston', { facing: 'east', extended: false }); w.setRaw(at(2, 0, 0), 'stone'); w.setRaw(at(2, 0, 1), 'piston', { facing: 'north', extended: false });
  w.setRaw(at(0, 0, 1), 'redstone_wire'); w.setRaw(at(1, 0, 1), 'redstone_wire');
  return [P('piston A (west)', at(1, 0, 0)), P('piston B (south)', at(2, 0, 1)), P('stone start', at(2, 0, 0)), P('east of it', at(3, 0, 0)), P('north of it', at(2, 0, -1))];
});

// ---- what a piston head destroys ----
const destroyList: [string, Record<string, any>][] = [
  ['redstone_wire', {}], ['repeater', { facing: 'west', delay: 1, powered: false }], ['comparator', { facing: 'west', mode: 'compare', powered: false }], ['redstone_torch', { lit: true }],
  ['lever', { face: 'floor' }], ['stone_button', { face: 'floor', facing: 'north' }], ['stone_pressure_plate', {}], ['redstone_lamp', { lit: false }], ['note_block', { powered: false }],
];
for (const [t, pr] of destroyList) {
  add(`D.destroy.${t}`, 'destroy', `plain piston pushes ${t}: destroyed or moved?`, 1, (w, at) => {
    stone(w, at); w.setRaw(at(1, 0, 0), 'piston', { facing: 'east', extended: false });
    w.setRaw(at(2, -1, 0), 'obsidian'); w.setRaw(at(3, -1, 0), 'obsidian'); w.setRaw(at(2, 0, 0), t, pr);
    return [P('piston', at(1, 0, 0)), P('target start', at(2, 0, 0)), P('target pushed', at(3, 0, 0))];
  });
}
// ---- pistons pushing pistons ----
for (const [t, f] of [['piston', 'north'], ['sticky_piston', 'up']] as const) {
  add(`P.push.${t}`, 'update order', `plain piston pushes a retracted ${t} (facing ${f})`, 1, (w, at) => {
    stone(w, at); w.setRaw(at(1, 0, 0), 'piston', { facing: 'east', extended: false }); w.setRaw(at(2, 0, 0), t, { facing: f, extended: false });
    return [P('pusher', at(1, 0, 0)), P('target start', at(2, 0, 0)), P('target pushed', at(3, 0, 0))];
  });
}
// ---- sand glued to slime ----
add('SS.slime', 'sand', 'sticky... plain piston pushes slime up, sand beside the slime is dragged up and falls back', 1, (w, at) => {
  stone(w, at); w.setRaw(at(1, -1, 0), 'obsidian'); w.setRaw(at(1, 0, 0), 'piston', { facing: 'up', extended: false }); w.setRaw(at(1, 1, 0), 'slime_block');
  w.setRaw(at(2, 0, 0), 'obsidian'); w.setRaw(at(2, 1, 0), 'sand');
  return [P('piston', at(1, 0, 0)), P('slime y1', at(1, 1, 0)), P('slime y2', at(1, 2, 0)), P('sand y1', at(2, 1, 0)), P('sand y2', at(2, 2, 0)), P('sand y3', at(2, 3, 0))];
});

export function buildLab3(w: World) { return buildGrid(w, defs, 7); }
if (import.meta.url === `file://${process.argv[1]}`) exportTimingLab('lab3', defs, 7);
