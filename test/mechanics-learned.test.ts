import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';

test('sticky piston: 2 gt pulse pushes and drops the block, 4+ gt pulse pulls it back', () => {
  const w = new World();
  w.place([0, 0, 0], 'sticky_piston', { facing: 'east' }); w.place([1, 0, 0], 'white_wool');
  w.place([0, 0, 1], 'redstone_block'); w.run(2); w.remove([0, 0, 1]); w.run(12);
  assert.equal(w.get([2, 0, 0]).type, 'white_wool', 'short pulse leaves the block pushed');
  const v = new World();
  v.place([0, 0, 0], 'sticky_piston', { facing: 'east' }); v.place([1, 0, 0], 'white_wool');
  v.place([0, 0, 1], 'redstone_block'); v.run(6); v.remove([0, 0, 1]); v.run(12);
  assert.equal(v.get([1, 0, 0]).type, 'white_wool', 'long pulse pulls it back');
});

test('quasi-connectivity: a repeater next to the cell above a piston powers it, a bare redstone block does not', () => {
  const a = new World();
  a.place([0, 0, 0], 'sticky_piston', { facing: 'down' }); a.place([0, 1, 1], 'redstone_block'); a.run(8);
  assert.equal(a.read([0, 0, 0], 'extended'), false);
  const b = new World();
  b.place([0, 0, 0], 'sticky_piston', { facing: 'down' });
  b.place([0, 0, 1], 'light_gray_wool'); b.place([0, 1, 1], 'repeater', { facing: 'south', delay: 1 });
  b.place([0, 1, 2], 'redstone_block'); b.run(8);
  assert.equal(b.read([0, 0, 0], 'extended'), true);
});

test('comparator side input ignores a powered wool block but reads a repeater', () => {
  const mk = (side: 'wool' | 'rep') => {
    const w = new World();
    for (let x = -1; x <= 3; x++) for (let z = -1; z <= 3; z++) w.place([x, 0, z], 'light_gray_wool');
    w.place([1, 1, 1], 'comparator', { facing: 'north', mode: 'subtract' });
    w.place([1, 1, 0], 'redstone_block');                       // rear power 15 (north side is the input)
    if (side === 'wool') { w.place([2, 1, 1], 'white_wool'); w.place([3, 1, 1], 'repeater', { facing: 'east', delay: 1 }); w.place([4, 0, 1], 'light_gray_wool'); w.place([4, 1, 1], 'redstone_block'); }
    else { w.place([2, 1, 1], 'repeater', { facing: 'east', delay: 1 }); w.place([3, 1, 1], 'redstone_block'); }
    w.run(10);
    return w.get([1, 1, 1]).p.output as number;
  };
  assert.equal(mk('wool'), 15, 'wool between is not a signal source for the side input');
  assert.equal(mk('rep'), 0, 'a repeater output on the side subtracts');
});
