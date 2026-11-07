import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildSandDoor3, isClosed, isOpen, countType } from '../examples/sand-door-3x3.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';
import type { Pos } from '../src/dirs.ts';

test('falling blocks: sand falls one block per scheduled tick chain, lands on the first solid block, stacks', () => {
  const w = new World();
  for (let x = 0; x < 3; x++) w.place([x, 0, 0], 'obsidian');
  w.place([1, 6, 0], 'sand'); w.place([1, 7, 0], 'sand');
  w.place([2, 3, 0], 'sand');            // next to nothing: floats? no, nothing below it -> falls onto the obsidian at x=2
  w.run(60);
  assert.equal(w.falling.length, 0);
  assert.equal(w.get([1, 1, 0]).type, 'sand'); assert.equal(w.get([1, 2, 0]).type, 'sand');
  assert.equal(w.get([2, 1, 0]).type, 'sand');
  for (const p of [[1, 6, 0], [1, 7, 0], [2, 3, 0]] as Pos[]) assert.equal(w.get(p).type, 'air');
});

test('sand does not fall while something solid (even a piston head or stone) is below it', () => {
  const w = new World();
  w.place([0, 0, 0], 'stone'); w.place([0, 1, 0], 'sand'); w.place([0, 2, 0], 'sand');
  w.run(40);
  assert.equal(w.get([0, 1, 0]).type, 'sand'); assert.equal(w.get([0, 2, 0]).type, 'sand');
});

test('3x3 sand door: opens and closes 6 times, all 8 sand blocks and both stone blocks survive, obsidian is untouched', () => {
  const w = new World();
  const { lever, door } = buildSandDoor3(w);
  w.run(120);
  assert.ok(isClosed(w, door), 'closed after settling');
  assert.equal(w.falling.length, 0);
  const obs = () => w.listBlocks().filter((b) => b.type === 'obsidian' || b.type === 'glass').map((b) => b.pos.join(',')).sort().join(';');
  const before = obs();
  const sand = countType(w, 'sand'), stone = countType(w, 'stone'), slime = countType(w, 'slime_block');
  assert.equal(sand, 8);
  for (let i = 0; i < 6; i++) {
    w.use(lever); w.run(80);
    assert.ok(isOpen(w, door), `open #${i}`);
    for (const p of [[1, 1, 1], [1, 2, 1], [1, 3, 1], [0, 1, 1], [2, 1, 1]] as Pos[]) assert.equal(w.get(p).type, 'air', `passage clear at ${p} #${i}`);
    w.use(lever); w.run(80);
    assert.ok(isClosed(w, door), `closed #${i}`);
    assert.equal(w.falling.length, 0);
  }
  assert.equal(obs(), before);
  assert.equal(countType(w, 'sand'), sand); assert.equal(countType(w, 'stone'), stone); assert.equal(countType(w, 'slime_block'), slime);
  assert.deepEqual(w.log.filter((l) => l.event.startsWith('falling block lost')), []);
});

test('3x3 sand door: survives export -> import and still works', () => {
  const w = new World();
  buildSandDoor3(w); w.run(120);
  const s = loadSchematic(exportSchem(w).buffer);
  assert.equal(s.blocks.length, w.listBlocks().length);
  assert.deepEqual(s.warnings.filter((x) => /sand/.test(x)), []);
});
