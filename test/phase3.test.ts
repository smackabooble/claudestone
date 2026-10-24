import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { JavaRandom } from '../src/jrandom.ts';

const count = (w: World, p: [number, number, number]) =>
  (w.items(p) ?? []).reduce((n, i) => n + (i?.count ?? 0), 0);

test('JavaRandom matches java.util.Random(0).nextInt(100)', () => {
  const r = new JavaRandom(0);
  const got = Array.from({ length: 10 }, () => r.nextInt(100));
  assert.deepEqual(got, [60, 48, 29, 47, 15, 53, 91, 61, 19, 54]);
});

test('comparator signal strength from container fullness', () => {
  const w = new World();
  w.place([0, -1, 0], 'stone');
  w.place([1, -1, 0], 'stone');
  w.place([0, 0, 0], 'chest', { inv: [{ id: 'stone', count: 64 }] });
  w.place([1, 0, 0], 'comparator', { facing: 'west' });
  w.run(2);
  assert.equal(w.read([1, 0, 0], 'output'), 1); // floor(14/27)+1
  for (let i = 0; i < 27; i++) w.setItem([0, 0, 0], i, { id: 'stone', count: 64 });
  w.run(2);
  assert.equal(w.read([1, 0, 0], 'output'), 15);
});

test('hopper moves 1 item per 8 ticks from chest above to chest below', () => {
  const w = new World();
  w.place([0, 2, 0], 'chest', { inv: [{ id: 'cobblestone', count: 5 }] });
  w.place([0, 1, 0], 'hopper', { facing: 'down' });
  w.place([0, 0, 0], 'chest');
  w.run(1);
  assert.equal(count(w, [0, 1, 0]), 1);
  w.run(8);
  assert.equal(count(w, [0, 0, 0]), 1);
  w.run(8);
  assert.equal(count(w, [0, 0, 0]), 2);
  assert.equal(count(w, [0, 2, 0]) + count(w, [0, 1, 0]) + count(w, [0, 0, 0]), 5);
});

test('powered hopper is locked', () => {
  const w = new World();
  w.place([0, 2, 0], 'chest', { inv: [{ id: 'cobblestone', count: 5 }] });
  w.place([0, 1, 0], 'hopper', { facing: 'down' });
  w.place([1, 1, 0], 'redstone_block');
  w.run(20);
  assert.equal(count(w, [0, 1, 0]), 0);
  w.remove([1, 1, 0]);
  w.run(2);
  assert.equal(count(w, [0, 1, 0]), 1);
});

test('dropper fires 4 ticks after power, into a container', () => {
  const w = new World();
  w.place([0, 0, 0], 'dropper', { facing: 'east', inv: [{ id: 'stone', count: 3 }] });
  w.place([1, 0, 0], 'chest');
  w.place([0, 1, 0], 'redstone_block');
  w.run(3);
  assert.equal(count(w, [1, 0, 0]), 0);
  w.run(1);
  assert.equal(count(w, [1, 0, 0]), 1);
  assert.equal(count(w, [0, 0, 0]), 2);
});

test('dispenser drops items into the world', () => {
  const w = new World();
  w.place([0, 0, 0], 'dispenser', { facing: 'east', inv: [{ id: 'stone', count: 3 }] });
  w.place([0, 1, 0], 'redstone_block');
  w.run(4);
  assert.equal(w.drops.length, 1);
  assert.equal(w.drops[0].item.id, 'stone');
});
