import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';

const type = (w: World, x: number, y: number, z: number) => w.get([x, y, z]).type;

test('piston pushes a block; settles after moving-piston animation', () => {
  const w = new World();
  w.place([0, 1, 0], 'piston', { facing: 'east' });
  w.place([1, 1, 0], 'stone');
  w.place([0, 1, 1], 'redstone_block');
  w.step();
  assert.equal(type(w, 1, 1, 0), 'moving_piston');
  assert.equal(type(w, 2, 1, 0), 'moving_piston');
  assert.equal(w.read([0, 1, 0], 'extended'), true);
  w.run(2);
  assert.equal(type(w, 1, 1, 0), 'piston_head');
  assert.equal(type(w, 2, 1, 0), 'stone');
});

test('piston retracts; non-sticky leaves the block', () => {
  const w = new World();
  w.place([0, 1, 0], 'piston', { facing: 'east' });
  w.place([1, 1, 0], 'stone');
  w.place([0, 1, 1], 'redstone_block');
  w.run(5);
  w.remove([0, 1, 1]);
  w.run(5);
  assert.equal(type(w, 0, 1, 0), 'piston');
  assert.equal(w.read([0, 1, 0], 'extended'), false);
  assert.equal(type(w, 1, 1, 0), 'air');
  assert.equal(type(w, 2, 1, 0), 'stone');
});

test('sticky piston pulls the block back', () => {
  const w = new World();
  w.place([0, 1, 0], 'sticky_piston', { facing: 'east' });
  w.place([1, 1, 0], 'stone');
  w.place([0, 1, 1], 'redstone_block');
  w.run(5);
  assert.equal(type(w, 2, 1, 0), 'stone');
  w.remove([0, 1, 1]);
  w.run(5);
  assert.equal(type(w, 1, 1, 0), 'stone');
  assert.equal(type(w, 2, 1, 0), 'air');
});

test('piston push limit is 12 blocks', () => {
  for (const [n, ok] of [[12, true], [13, false]] as const) {
    const w = new World();
    w.place([0, 1, 0], 'piston', { facing: 'east' });
    for (let i = 1; i <= n; i++) w.place([i, 1, 0], 'stone');
    w.place([0, 1, 1], 'redstone_block');
    w.run(5);
    assert.equal(w.read([0, 1, 0], 'extended'), ok, `n=${n}`);
  }
});

test('obsidian blocks pistons; redstone wire in front is destroyed', () => {
  const w = new World();
  w.place([0, 1, 0], 'piston', { facing: 'east' });
  w.place([1, 1, 0], 'obsidian');
  w.place([0, 1, 1], 'redstone_block');
  w.run(5);
  assert.equal(w.read([0, 1, 0], 'extended'), false);
  const w2 = new World();
  w2.place([0, 1, 0], 'piston', { facing: 'east' });
  w2.place([1, 0, 0], 'stone');
  w2.place([1, 1, 0], 'redstone_wire');
  w2.place([0, 1, 1], 'redstone_block');
  w2.run(5);
  assert.equal(w2.read([0, 1, 0], 'extended'), true);
  assert.equal(type(w2, 1, 1, 0), 'piston_head');
});

test('slime block drags attached blocks sideways', () => {
  const w = new World();
  w.place([0, 1, 0], 'piston', { facing: 'east' });
  w.place([1, 1, 0], 'slime_block');
  w.place([1, 1, 1], 'stone'); // stuck to the slime
  w.place([0, 1, -1], 'redstone_block');
  w.run(5);
  assert.equal(type(w, 2, 1, 0), 'slime_block');
  assert.equal(type(w, 2, 1, 1), 'stone');
  assert.equal(type(w, 1, 1, 1), 'air');
});

test('observer pulses 2 ticks after the watched block changes, for 2 ticks', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone');
  w.place([1, 1, 0], 'observer', { facing: 'west' }); // watches (0,1,0); output east
  w.place([2, 1, 0], 'redstone_lamp');
  w.place([0, 0, 0], 'stone');
  w.place([0, 1, 0], 'stone'); // change in watched position
  w.run(1);
  assert.equal(w.read([1, 1, 0], 'powered'), false);
  w.run(1);
  assert.equal(w.read([1, 1, 0], 'powered'), true);
  assert.equal(w.read([2, 1, 0], 'lit'), true);
  w.run(2);
  assert.equal(w.read([1, 1, 0], 'powered'), false);
});

test('comparator reads a container (signal 7) and outputs 7 after 2 ticks', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone'); w.place([1, 0, 0], 'stone'); w.place([2, 0, 0], 'stone');
  w.place([0, 1, 0], 'chest', { signal: 7 });
  w.place([1, 1, 0], 'comparator', { facing: 'west' }); // input west, output east
  w.place([2, 1, 0], 'redstone_wire');
  w.run(1);
  assert.equal(w.read([2, 1, 0], 'power'), 0);
  w.run(1);
  assert.equal(w.read([2, 1, 0], 'power'), 7);
});

test('subtract mode: output = rear - side', () => {
  const w = new World();
  for (let x = 0; x <= 2; x++) w.place([x, 0, 0], 'stone');
  w.place([1, 0, -1], 'stone');
  w.place([0, 1, 0], 'chest', { signal: 10 });
  w.place([1, 1, 0], 'comparator', { facing: 'west', mode: 'subtract' });
  w.place([2, 1, 0], 'redstone_wire');
  // side input: wire with power 4 pointing into the comparator from the north
  w.place([1, 1, -1], 'redstone_wire');
  w.place([1, 1, -2], 'redstone_block');
  w.place([1, 0, -2], 'stone');
  w.run(4);
  assert.equal(w.read([1, 1, -1], 'power'), 15);
  assert.equal(w.read([1, 1, 0], 'output'), 0); // 10 - 15 -> 0
});

test('torch pops off when its support is pushed away', () => {
  const w = new World();
  w.place([0, 1, 0], 'piston', { facing: 'east' });
  w.place([1, 1, 0], 'stone');
  w.place([1, 2, 0], 'redstone_torch');
  w.place([0, 1, 1], 'redstone_block');
  w.run(5);
  assert.equal(type(w, 1, 2, 0), 'air');
});
