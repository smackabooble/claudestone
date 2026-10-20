import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { loadSchematic } from '../src/schematic.ts';

// user-supplied compact 3x3 door (knowledge/refs/compact-3x3.litematic): door plane z=4, doorway x=3..5, y=6..8
test('reference compact 3x3 door: lever closes it (9 blocks into the doorway) and reopens it', () => {
  const s = loadSchematic(readFileSync(new URL('../knowledge/refs/compact-3x3.litematic', import.meta.url)));
  const w = new World();
  for (const b of s.blocks) w.setRaw(b.pos, b.type, b.props);
  w.run(40);
  const cells = [3, 4, 5].flatMap((x) => [6, 7, 8].map((y) => [x, y, 4] as [number, number, number]));
  const filled = () => cells.filter((p) => w.get(p).type === 'stone').length;
  assert.equal(filled(), 0, 'open at rest');
  for (let i = 0; i < 3; i++) {
    w.use([6, 9, 2]); w.run(120);
    assert.equal(filled(), 9, `closed #${i}`);
    w.use([6, 9, 2]); w.run(120);
    assert.equal(filled(), 0, `open #${i}`);
  }
});

// abfielder's compact 4x4 (knowledge/refs/compact-4x4-abfielder.litematic): doorway x=3..6,y=3..6 in plane z=2, lever (5,1,0).
// Needs furnaces (block entities) to be IMMOVABLE: the importer used to turn them into stone and the door fell apart.
test('reference compact 4x4 door (observer chain, no slime): closes with 16 blocks and reopens, 3 cycles', () => {
  const s = loadSchematic(readFileSync(new URL('../knowledge/refs/compact-4x4-abfielder.litematic', import.meta.url)));
  const w = new World();
  for (const b of s.blocks) w.setRaw(b.pos, b.type, b.props);
  w.run(40);
  const cells = [3, 4, 5, 6].flatMap((x) => [3, 4, 5, 6].map((y) => [x, y, 2] as [number, number, number]));
  const solid = (p: [number, number, number]) => w.get(p).type !== 'air';
  const filled = () => cells.filter(solid).length;
  assert.equal(filled(), 0, 'open at rest');
  for (let i = 0; i < 3; i++) {
    w.use([5, 1, 0]); w.run(150);
    assert.equal(filled(), 16, `closed #${i}`);
    w.use([5, 1, 0]); w.run(150);
    assert.equal(filled(), 0, `open #${i}`);
  }
});
