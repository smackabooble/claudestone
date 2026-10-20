import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildDoor3 } from '../examples/piston-door-3x3.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';
import type { Pos } from '../src/dirs.ts';

const closed = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'stone');
const open = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'air');

// blocks that must never move: everything that is not part of the door mechanism
const STATIC = new Set(['obsidian', 'glass']);
const snapshotStatic = (w: World) =>
  w.listBlocks().filter((b) => STATIC.has(b.type)).map((b) => b.pos.join(',')).sort().join(';');

test('3x3 door: opens and closes 6 times, nothing else gets dragged along', () => {
  const w = new World();
  const { lever, door } = buildDoor3(w);
  w.run(120);
  assert.ok(closed(w, door), 'closed after settling');
  const before = snapshotStatic(w);
  const count = (t: string) => w.listBlocks().filter((b) => b.type === t).length;
  const slimes = count('slime_block'), stones = count('stone');
  for (let i = 0; i < 6; i++) {
    w.use(lever); w.run(60);
    assert.ok(open(w, door), `open #${i}`);
    for (const p of [[1, 1, 1], [1, 2, 1], [1, 3, 1], [0, 1, 1], [2, 1, 1]] as Pos[]) assert.equal(w.get(p).type, 'air', `passage clear at ${p} #${i}`);
    w.use(lever); w.run(60);
    assert.ok(closed(w, door), `closed #${i}`);
  }
  assert.equal(snapshotStatic(w), before, 'obsidian/glass untouched');
  assert.equal(count('slime_block'), slimes);
  assert.equal(count('stone'), stones);
});

test('3x3 door: works with the lever toggled again right after it finishes (40 tick gaps)', () => {
  const w = new World();
  const { lever, door } = buildDoor3(w);
  w.run(120);
  for (let i = 0; i < 5; i++) {
    w.use(lever); w.run(40);
    assert.ok(open(w, door), `open #${i}`);
    w.use(lever); w.run(40);
    assert.ok(closed(w, door), `closed #${i}`);
  }
});

test('3x3 door: survives export -> import and still works', () => {
  const w = new World();
  const { lever, door } = buildDoor3(w);
  w.run(120);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  const sch = loadSchematic(buffer);
  for (const b of sch.blocks) {
    try { w2.place(b.pos, b.type, b.props); } catch { /* unsupported support order is reported by the loader */ }
  }
  w2.run(150);
  const o = (p: Pos): Pos => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  assert.ok(closed(w2, door.map(o)), 'closed after paste');
  w2.use(o(lever)); w2.run(60);
  assert.ok(open(w2, door.map(o)), 'opens after paste');
  w2.use(o(lever)); w2.run(60);
  assert.ok(closed(w2, door.map(o)), 'closes after paste');
});
