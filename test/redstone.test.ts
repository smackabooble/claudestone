import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';

const floor = (w: World, x0: number, x1: number, z = 0) => {
  for (let x = x0; x <= x1; x++) w.place([x, 0, z], 'stone');
};

test('wire power decays 1 per block and stops at 0', () => {
  const w = new World();
  floor(w, 0, 17);
  w.place([0, 1, 0], 'redstone_block');
  for (let x = 1; x <= 17; x++) w.place([x, 1, 0], 'redstone_wire');
  assert.equal(w.read([1, 1, 0], 'power'), 15);
  assert.equal(w.read([15, 1, 0], 'power'), 1);
  assert.equal(w.read([16, 1, 0], 'power'), 0);
});

test('lamp turns on instantly, off after 4 ticks', () => {
  const w = new World();
  floor(w, 0, 2);
  w.place([0, 1, 0], 'lever', { face: 'floor' });
  w.place([1, 1, 0], 'redstone_wire');
  w.place([2, 1, 0], 'redstone_lamp');
  assert.equal(w.read([2, 1, 0], 'lit'), false);
  w.use([0, 1, 0]);
  assert.equal(w.read([2, 1, 0], 'lit'), true);
  w.use([0, 1, 0]);
  w.run(3);
  assert.equal(w.read([2, 1, 0], 'lit'), true);
  w.run(1);
  assert.equal(w.read([2, 1, 0], 'lit'), false);
});

test('repeater adds 2*delay game ticks', () => {
  for (const delay of [1, 2, 3, 4]) {
    const w = new World();
    floor(w, 0, 3);
    w.place([0, 1, 0], 'lever', { face: 'floor' });
    w.place([1, 1, 0], 'repeater', { facing: 'west', delay }); // input west, output east
    w.place([2, 1, 0], 'redstone_lamp');
    w.use([0, 1, 0]);
    w.run(2 * delay - 1);
    assert.equal(w.read([2, 1, 0], 'lit'), false, `delay ${delay} early`);
    w.run(1);
    assert.equal(w.read([2, 1, 0], 'lit'), true, `delay ${delay} on time`);
  }
});

test('floor torch under power turns off after 2 ticks, back on after 2', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone');
  w.place([0, 1, 0], 'redstone_torch');
  w.place([0, 2, 0], 'stone'); // powered by torch below
  w.place([1, 2, 0], 'redstone_lamp');
  assert.equal(w.read([1, 2, 0], 'lit'), true);
  // power the torch's support block with a redstone block next to it
  w.place([-1, 0, 0], 'redstone_block');
  w.place([-1, 0, 1], 'stone');
  assert.equal(w.read([0, 1, 0], 'lit'), true);
  // redstone block does not strongly power; use lever on the support instead
  w.remove([-1, 0, 0]);
  w.place([-1, 0, 0], 'lever', { face: 'wall', facing: 'west' }); // attached to (0,0,0)
  w.use([-1, 0, 0]);
  assert.equal(w.read([0, 1, 0], 'lit'), true);
  w.run(1);
  assert.equal(w.read([0, 1, 0], 'lit'), true);
  w.run(1);
  assert.equal(w.read([0, 1, 0], 'lit'), false);
  w.use([-1, 0, 0]);
  w.run(2);
  assert.equal(w.read([0, 1, 0], 'lit'), true);
});

test('torch burns out when toggled too frequently', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone');
  w.place([0, 1, 0], 'redstone_torch');
  w.place([0, 1, 1], 'stone');
  // feedback loop: torch -> block above -> wire -> back onto torch support
  w.place([0, 2, 0], 'stone');
  w.place([0, 3, 0], 'redstone_wire');
  w.place([1, 3, 0], 'stone');
  w.place([1, 2, 0], 'stone');
  // simple pulse source: lever toggled every 2 ticks
  w.place([-1, 0, 0], 'lever', { face: 'wall', facing: 'west' });
  let offs = 0;
  let prev = true;
  for (let i = 0; i < 80; i++) {
    if (i % 2 === 0) w.use([-1, 0, 0]);
    w.step();
    const lit = w.read([0, 1, 0], 'lit');
    if (prev && !lit) offs++;
    prev = lit;
  }
  assert.ok(offs <= 8, `torch toggled ${offs} times; burnout should cap it`);
});

test('repeater locks when powered from the side by a repeater', () => {
  const w = new World();
  floor(w, 0, 4, 0);
  floor(w, 1, 1, -1);
  floor(w, 1, 1, 1);
  w.place([0, 1, 0], 'lever', { face: 'floor' });
  // main repeater at (1,1,0): input west, output east
  w.place([1, 1, 0], 'repeater', { facing: 'west', delay: 1, powered: false });
  w.place([2, 1, 0], 'redstone_lamp');
  // locking repeater at (1,1,-1) outputs south into main repeater's side; its input is north
  w.place([1, 2, -1], 'redstone_block'); // placeholder removed below
  w.remove([1, 2, -1]);
  w.place([1, 1, -1], 'repeater', { facing: 'north', delay: 1 });
  w.place([1, 1, -2], 'redstone_block');
  w.run(4); // locking repeater powered
  assert.equal(w.read([1, 1, -1], 'powered'), true);
  w.use([0, 1, 0]);
  w.run(10);
  assert.equal(w.read([1, 1, 0], 'powered'), false, 'locked repeater must not change');
  assert.equal(w.read([2, 1, 0], 'lit'), false);
});

test('button powers for 20 ticks', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone');
  w.place([0, 1, 0], 'stone_button', { face: 'floor' });
  w.place([1, 1, 0], 'redstone_lamp');
  w.use([0, 1, 0]);
  assert.equal(w.read([1, 1, 0], 'lit'), true);
  w.run(19);
  assert.equal(w.read([0, 1, 0], 'powered'), true);
  w.run(1);
  assert.equal(w.read([0, 1, 0], 'powered'), false);
});
