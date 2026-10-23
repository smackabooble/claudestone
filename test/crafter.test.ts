import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { craft } from '../src/recipes.ts';

const D = 'diamond', S = 'stick';
test('recipes: diamond armour, tools, block/planks/sticks', () => {
  assert.equal(craft([D, D, D, D, null, D, null, null, null])?.id, 'diamond_helmet');
  assert.equal(craft([D, null, D, D, D, D, D, D, D])?.id, 'diamond_chestplate');
  assert.equal(craft([D, D, D, D, null, D, D, null, D])?.id, 'diamond_leggings');
  assert.equal(craft([null, null, null, D, null, D, D, null, D])?.id, 'diamond_boots');
  assert.equal(craft([null, D, null, null, D, null, null, S, null])?.id, 'diamond_sword');
  assert.equal(craft([D, D, D, null, S, null, null, S, null])?.id, 'diamond_pickaxe');
  assert.equal(craft([D, D, null, D, S, null, null, S, null])?.id, 'diamond_axe');
  assert.equal(craft([null, D, D, null, S, D, null, S, null])?.id, 'diamond_axe', 'mirrored');
  assert.equal(craft([null, D, null, null, S, null, null, S, null])?.id, 'diamond_shovel');
  assert.deepEqual(craft(['diamond_block']), { id: 'diamond', count: 9 });
  assert.deepEqual(craft(['oak_log']), { id: 'oak_planks', count: 4 });
  assert.deepEqual(craft(['oak_planks', null, null, null, null, null, 'oak_planks', null, null]), null, 'planks must be adjacent');
  assert.deepEqual(craft([null, 'oak_planks', null, null, 'oak_planks', null]), { id: 'stick', count: 4 });
  assert.equal(craft([D, D, D, D, null, null, null, null, null]), null);
});

const rig = () => {
  const w = new World();
  w.place([0, 0, 0], 'crafter', { facing: 'east' });
  w.place([1, 0, 0], 'chest');
  return w;
};
const pulse = (w: World, at: [number, number, number]) => { w.place(at, 'redstone_block'); w.run(10); w.remove(at); w.run(10); };

test('crafter: crafts on a rising edge into the container in front, consumes one of each', () => {
  const w = rig();
  w.setItem([0, 0, 0], 0, { id: 'diamond_block', count: 3 });
  pulse(w, [0, 1, 0]);
  assert.deepEqual(w.items([1, 0, 0])![0], { id: 'diamond', count: 9 });
  assert.equal(w.items([0, 0, 0])![0]!.count, 2);
});

test('crafter: disabled slots count as empty; no match = nothing happens; result with no container drops', () => {
  const w = rig();
  // sword: diamond, diamond, stick down the middle column (slots 1,4,7); disable the rest
  for (const s of [0, 2, 3, 5, 6, 8]) w.setSlotDisabled([0, 0, 0], s, true);
  w.setItem([0, 0, 0], 1, { id: 'diamond', count: 1 }); w.setItem([0, 0, 0], 4, { id: 'diamond', count: 1 });
  pulse(w, [0, 1, 0]);
  assert.equal(w.items([1, 0, 0])!.filter(Boolean).length, 0, 'sword needs a stick');
  w.setItem([0, 0, 0], 7, { id: 'stick', count: 1 });
  pulse(w, [0, 1, 0]);
  assert.deepEqual(w.items([1, 0, 0])![0], { id: 'diamond_sword', count: 1 });
  const v = new World(); v.place([0, 0, 0], 'crafter', { facing: 'east' }); v.setItem([0, 0, 0], 0, { id: 'oak_log', count: 1 });
  pulse(v, [0, 1, 0]);
  assert.deepEqual(v.drops[0].item, { id: 'oak_planks', count: 4 });
});

test('hopper feeding a crafter spreads items over the enabled slots one by one', () => {
  const w = new World();
  w.place([0, 1, 0], 'chest'); w.place([0, 0, 0], 'hopper', { facing: 'south' });
  w.place([0, 0, 1], 'crafter', { facing: 'east' });
  for (const s of [0, 2, 3, 5, 6, 8]) w.setSlotDisabled([0, 0, 1], s, true);
  w.setItem([0, 1, 0], 0, { id: 'diamond', count: 6 });
  w.run(200);
  assert.deepEqual([1, 4, 7].map((s) => w.items([0, 0, 1])![s]?.count), [2, 2, 2]);
  assert.equal(w.items([0, 0, 1])!.filter(Boolean).length, 3);
});

test('comparator on a crafter reads filled + disabled slots', () => {
  const w = new World();
  w.place([0, 0, 0], 'crafter', { facing: 'north' });
  w.place([1, -1, 0], 'stone'); w.place([1, 0, 0], 'comparator', { facing: 'west' });
  w.setSlotDisabled([0, 0, 0], 0, true); w.setSlotDisabled([0, 0, 0], 1, true);
  w.setItem([0, 0, 0], 4, { id: 'stick', count: 5 });
  w.run(6);
  assert.equal(w.get([1, 0, 0]).p.output, 3);
});

import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';
test('crafter survives export -> import', () => {
  const w = new World(); w.place([0, 0, 0], 'crafter', { facing: 'east' });
  const s = loadSchematic(exportSchem(w).buffer);
  const b = s.blocks.find((x) => x.type === 'crafter')!;
  assert.equal(b.props.facing, 'east');
});

test('double chest: both halves share one 54-slot inventory; a hopper under each half pulls from it', () => {
  const w = new World();
  w.place([0, 1, 0], 'chest', { facing: 'north', type: 'left' });   // left half; partner = facing.clockwise = east
  w.place([1, 1, 0], 'chest', { facing: 'north', type: 'right' });
  w.place([0, 0, 0], 'hopper', { facing: 'west' }); w.place([1, 0, 0], 'hopper', { facing: 'east' });
  w.place([-1, 0, 0], 'chest'); w.place([2, 0, 0], 'chest');
  w.setItem([1, 1, 0], 0, { id: 'diamond', count: 4 });                // set through the right half
  assert.equal(w.items([0, 1, 0])![0]!.count, 4, 'same inventory');
  w.run(80);
  const got = (p: [number, number, number]) => w.items(p)!.reduce((a, i) => a + (i?.count ?? 0), 0);
  assert.equal(got([-1, 0, 0]) + got([2, 0, 0]), 4);
  assert.ok(got([-1, 0, 0]) > 0 && got([2, 0, 0]) > 0, 'both hoppers served');
});
