import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';

test('iron door opens instantly when powered, closes when unpowered', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone');
  w.place([0, 1, 0], 'iron_door', { facing: 'east' });
  w.place([1, 1, 0], 'redstone_block');
  assert.equal(w.read([0, 1, 0], 'open'), true);
  assert.equal(w.read([0, 2, 0], 'open'), true);
  w.remove([1, 1, 0]);
  assert.equal(w.read([0, 1, 0], 'open'), false);
  assert.equal(w.read([0, 2, 0], 'open'), false);
});

test('iron door powered through its upper half', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone');
  w.place([0, 1, 0], 'iron_door');
  w.place([1, 2, 0], 'redstone_block');
  assert.equal(w.read([0, 1, 0], 'open'), true);
});

test('pressure plate: powers on press, stays 20 ticks after release', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone');
  w.place([0, 1, 0], 'stone_pressure_plate');
  w.place([1, 1, 0], 'redstone_lamp');
  w.use([0, 1, 0]); // step on
  assert.equal(w.read([1, 1, 0], 'lit'), true);
  w.use([0, 1, 0]); // step off
  w.run(19);
  assert.equal(w.read([0, 1, 0], 'powered'), true);
  w.run(1);
  assert.equal(w.read([0, 1, 0], 'powered'), false);
});

test('pressure plate strongly powers the block below it', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone');
  w.place([0, -1, 0], 'stone');
  w.place([0, 1, 0], 'stone_pressure_plate');
  w.place([1, 0, 0], 'redstone_lamp');
  w.use([0, 1, 0]);
  assert.equal(w.read([1, 0, 0], 'lit'), true);
});

test('honey does not stick to slime', () => {
  const w = new World();
  w.place([0, 1, 0], 'piston', { facing: 'east' });
  w.place([1, 1, 0], 'slime_block');
  w.place([1, 1, 1], 'honey_block');
  w.place([0, 1, -1], 'redstone_block');
  w.run(5);
  assert.equal(w.get([2, 1, 0]).type, 'slime_block');
  assert.equal(w.get([1, 1, 1]).type, 'honey_block'); // stayed
});

test('honey drags attached blocks like slime', () => {
  const w = new World();
  w.place([0, 1, 0], 'piston', { facing: 'east' });
  w.place([1, 1, 0], 'honey_block');
  w.place([1, 1, 1], 'stone');
  w.place([0, 1, -1], 'redstone_block');
  w.run(5);
  assert.equal(w.get([2, 1, 1]).type, 'stone');
});

test('TNT is primed (and removed) when powered', () => {
  const w = new World();
  w.place([0, 0, 0], 'tnt');
  w.place([1, 0, 0], 'redstone_block');
  assert.equal(w.get([0, 0, 0]).type, 'air');
  assert.equal(w.log[0].event, 'tnt_primed');
});
