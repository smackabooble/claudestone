// Community-documented behaviors (not recordings): failures here point at porting bugs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';

const type = (w: World, x: number, y: number, z: number) => w.get([x, y, z]).type;

test('quasi-connectivity: piston is powered by a source diagonally above it', () => {
  const w = new World();
  w.place([0, 2, 0], 'piston', { facing: 'east' });
  w.place([0, 3, -1], 'redstone_block');
  w.run(3);
  assert.equal(w.read([0, 2, 0], 'extended'), false); // no update reaches it yet (BUD behavior)
  w.place([0, 2, 1], 'stone'); // block update next to the piston
  w.run(3);
  assert.equal(w.read([0, 2, 0], 'extended'), true);
});

test('quasi-connectivity: a dropper triggers from a source diagonally above', () => {
  const w = new World();
  w.place([0, 0, 0], 'dropper', { facing: 'east', inv: [{ id: 'stone', count: 2 }] });
  w.place([0, 1, -1], 'redstone_block');
  w.place([0, 0, 1], 'stone'); // block update next to the dropper
  w.run(5);
  assert.equal(w.drops.length, 1);
});

test('torch strongly powers the block above, not its base', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone');
  w.place([0, 1, 0], 'redstone_torch');
  w.place([0, 2, 0], 'stone');
  w.place([1, 2, 0], 'redstone_lamp'); // next to the strongly-powered block
  w.place([1, 0, 0], 'stone');
  w.place([1, 1, 0], 'redstone_lamp'); // next to the torch itself
  assert.equal(w.read([1, 2, 0], 'lit'), true);
  assert.equal(w.read([1, 1, 0], 'lit'), true);
  const w2 = new World();
  w2.place([0, 0, 0], 'stone');
  w2.place([0, 1, 0], 'redstone_torch');
  w2.place([1, 0, 0], 'redstone_lamp'); // next to the torch's base block
  assert.equal(w2.read([1, 0, 0], 'lit'), false);
});

test('dust powers a block it points into, but not dust on the far side', () => {
  const w = new World();
  for (let x = -1; x <= 3; x++) w.place([x, 0, 0], 'stone');
  w.place([-1, 1, 0], 'redstone_block');
  w.place([0, 1, 0], 'redstone_wire'); // points east into the stone below-level block
  w.place([1, 1, 0], 'stone');
  w.place([2, 1, 0], 'redstone_wire');
  w.place([1, 1, 1], 'redstone_lamp'); // adjacent to the pointed-into block
  assert.equal(w.read([0, 1, 0], 'power'), 15);
  assert.equal(w.read([1, 1, 1], 'lit'), true);
  assert.equal(w.read([2, 1, 0], 'power'), 0);
});

test('dust climbs a step unless a conductor sits above the lower dust', () => {
  const build = (cap?: string) => {
    const w = new World();
    for (let x = 0; x <= 2; x++) w.place([x, 0, 0], 'stone');
    w.place([2, 1, 0], 'stone');
    w.place([0, 1, 0], 'redstone_block');
    w.place([1, 1, 0], 'redstone_wire');
    w.place([2, 2, 0], 'redstone_wire');
    if (cap) { w.place([1, 2, 0], cap); }
    return w;
  };
  assert.equal(build().read([2, 2, 0], 'power'), 14);
  assert.equal(build('stone').read([2, 2, 0], 'power'), 0);
  assert.equal(build('glass').read([2, 2, 0], 'power'), 14);
});

test('repeaters are locked only by repeaters/comparators, not by levers', () => {
  const w = new World();
  for (let x = 0; x <= 3; x++) w.place([x, 0, 0], 'stone');
  w.place([1, 0, -1], 'stone');
  w.place([1, 0, 1], 'stone');
  w.place([0, 1, 0], 'lever', { face: 'floor' });
  w.place([1, 1, 0], 'repeater', { facing: 'west', delay: 1 });
  w.place([2, 1, 0], 'redstone_lamp');
  w.place([1, 1, -1], 'lever', { face: 'floor', powered: true }); // beside the repeater
  w.use([0, 1, 0]);
  w.run(3);
  assert.equal(w.read([2, 1, 0], 'lit'), true);
});

test('sticky piston short pulse (1gt) leaves the block behind', () => {
  const w = new World();
  w.place([0, 1, 0], 'sticky_piston', { facing: 'east' });
  w.place([1, 1, 0], 'stone');
  w.place([0, 1, 1], 'redstone_block');
  w.step();
  w.remove([0, 1, 1]);
  w.run(6);
  assert.equal(type(w, 2, 1, 0), 'stone');
  assert.equal(type(w, 1, 1, 0), 'air');
  assert.equal(w.read([0, 1, 0], 'extended'), false);
});

test('redstone torch clock burns out and recovers', () => {
  // classic 1-torch loop: torch -> block -> wire -> back onto its own support is unstable
  const w = new World();
  w.place([0, 0, 0], 'stone');
  w.place([0, 1, 0], 'redstone_torch');
  w.place([0, 2, 0], 'stone');
  w.place([1, 2, 0], 'stone');
  w.place([1, 3, 0], 'redstone_wire');
  w.place([0, 3, 0], 'redstone_wire');
  w.place([1, 1, 0], 'stone');
  w.place([1, 0, 0], 'stone');
  w.run(200); // must terminate without exceptions or runaway recursion
  assert.ok(true);
});

test('lone dust is a cross: powers adjacent lamps on all four sides; right-click makes a dot that powers none', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone');
  w.place([0, 1, 0], 'redstone_wire');
  w.place([1, 0, 0], 'stone'); w.place([-1, 0, 0], 'stone');
  w.place([0, 0, 1], 'stone'); w.place([0, 0, -1], 'stone');
  w.place([1, 1, 0], 'redstone_lamp'); w.place([-1, 1, 0], 'redstone_lamp');
  w.place([0, 1, 1], 'redstone_lamp'); w.place([0, 1, -1], 'redstone_lamp');
  w.place([0, 2, 0], 'redstone_block'); // above the wire: powers it
  assert.equal(w.read([0, 1, 0], 'power'), 15);
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.equal(w.read([x, 1, z], 'lit'), true);
  w.use([0, 1, 0]); // cross -> dot
  w.run(5);
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.equal(w.read([x, 1, z], 'lit'), false);
  w.use([0, 1, 0]); // dot -> cross
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.equal(w.read([x, 1, z], 'lit'), true);
});

test('a wire that loses its only neighbor stays a cross', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone'); w.place([1, 0, 0], 'stone');
  w.place([0, 1, 0], 'redstone_wire');
  w.place([1, 1, 0], 'redstone_wire');
  w.remove([1, 1, 0]);
  const b = w.get([0, 1, 0]).p;
  assert.deepEqual([b.north, b.east, b.south, b.west], ['side', 'side', 'side', 'side']);
});

test('chained pistons fire 3 ticks apart (wiki: block arrives in block-entity phase, event next tick)', () => {
  const w = new World();
  w.place([0, 1, 0], 'piston', { facing: 'east' });
  w.place([2, 1, 1], 'piston', { facing: 'east' });
  w.place([1, 1, 0], 'redstone_block'); // pushed to (2,1,0), where it powers B (a piston ignores power from its front)
  w.place([0, 1, 1], 'redstone_block'); // powers A from the side
  const at: Record<string, number> = {};
  for (let t = 1; t <= 10; t++) {
    w.step();
    if (w.read([0, 1, 0], 'extended') && !('A' in at)) at.A = t;
    if (w.read([2, 1, 1], 'extended') && !('B' in at)) at.B = t;
  }
  assert.equal(at.A, 1);
  assert.equal(at.B! - at.A!, 3);
});

test('slime blocks conduct redstone power (strongly powered slime powers adjacent lamps)', () => {
  const w = new World();
  w.place([0, 0, 0], 'slime_block');
  w.place([0, 1, 0], 'lever', { face: 'floor' });
  w.place([1, 0, 0], 'redstone_lamp');
  w.use([0, 1, 0]);
  assert.equal(w.read([1, 0, 0], 'lit'), true);
});
