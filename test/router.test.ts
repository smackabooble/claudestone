import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { Board, route, assignRepeaters, conveyor } from '../examples/noglue-lib.ts';
import type { Pos } from '../src/dirs.ts';

test('dust router: climbs at most 4 steps in a row, so every staircase leaves straight cells for booster repeaters', () => {
  const w = new World(); const b = new Board(w);
  b.dust([0, 0, 0], 'a'); b.dust([40, 12, 0], 'a');
  const path = route(b, [0, 0, 0], [40, 12, 0], 'a', { own: ['a'] });
  let run = 0, worst = 0;
  for (let i = 1; i < path.length; i++) { run = path[i][1] !== path[i - 1][1] ? run + 1 : 0; worst = Math.max(worst, run); }
  assert.ok(worst <= 4, `longest vertical run ${worst}`);
  // no cell twice, and every cell's floor is wool or free
  assert.equal(new Set(path.map((p) => p.join(','))).size, path.length);
  assignRepeaters(b, path, 'a', undefined, 8);
});

test('hopper conveyor never leaves a hopper directly under a dropper (it would suck the dropper empty)', () => {
  const w = new World(); const b = new Board(w);
  // a dropper right next to the start of the line: the straight way down-and-east passes under it
  b.raw([5, 5, 0], 'dropper', { facing: 'east' }, 'piston', '__q');
  b.raw([4, 5, 0], 'hopper', { facing: 'down' }, 'piston', '__s');
  b.raw([20, 2, 0], 'chest', { facing: 'south', type: 'single' }, 'piston', '__s');
  conveyor(b, [4, 5, 0], [20, 2, 0], 'line');
  for (const blk of w.listBlocks()) {
    if (blk.type !== 'hopper') continue;
    const up = w.get([blk.pos[0], blk.pos[1] + 1, blk.pos[2]]);
    assert.notEqual(up.type, 'dropper', `hopper under a dropper at ${blk.pos.join(',')}`);
  }
});

test('hopper conveyor does not sit under a chest/hopper line it does not feed, and ends facing the target', () => {
  const w = new World(); const b = new Board(w);
  b.raw([0, 5, 0], 'hopper', { facing: 'down' }, 'piston', '__s');
  b.raw([12, 0, 3], 'chest', { facing: 'south', type: 'single' }, 'piston', '__s');
  const path: Pos[] = conveyor(b, [0, 5, 0], [12, 0, 3], 'line');
  const last = path[path.length - 1];
  const h = w.get(last);
  assert.equal(h.type, 'hopper');
  assert.ok(path.every((p, i) => i === 0 || p[1] <= path[i - 1][1]), 'hoppers never go up');
});
