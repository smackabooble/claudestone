import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { Board } from '../examples/noglue-lib.ts';
import { buildLift } from '../examples/gear-lift.ts';

// vanilla-style item physics: a dropper throws items into a soul-sand bubble column, the column carries them up, the top hopper picks them up
test('item lift in the sim: items rise in the bubble column and are picked up by the top hopper', () => {
  const w = new World(); const b = new Board(w);
  const l = buildLift(b, [20, 0, 40], 5, 30, 'T', [5]);
  w.itemPhysics = true;
  w.setItem(l.dropper, 0, { id: 'diamond', count: 3 });
  w.run(400);
  const n = (p: any) => ((w.items(p) ?? []) as any[]).reduce((a, x) => a + (x ? x.count : 0), 0);
  assert.equal(n(l.exit), 3, 'all three items reach the hopper that starts the conveyor');
  assert.equal(w.ents3.length, 0);
  assert.deepEqual(w.waterLeaks(), []);
});
