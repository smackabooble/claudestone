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
