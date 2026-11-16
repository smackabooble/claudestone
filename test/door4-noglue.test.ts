import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildDoor4NoGlue } from '../examples/piston-door-4x4-noglue.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

test('glue-free 4x4 door (wool): 16 white wool close and reopen, 3 cycles, no slime/honey', () => {
  const w = new World(); const { lever, doorway } = buildDoor4NoGlue(w); w.run(40);
  assert.ok(!w.listBlocks().some((b) => b.type === 'slime_block' || b.type === 'honey_block'));
  const n = () => doorway.filter((p) => w.get(p).type === 'white_wool').length;
  assert.equal(n(), 0);
  for (let i = 0; i < 3; i++) { w.use(lever); w.run(150); assert.equal(n(), 16, `closed ${i}`); w.use(lever); w.run(150); assert.equal(n(), 0, `open ${i}`); }
});

test('glue-free 4x4 door survives export -> import', () => {
  const a = new World(); buildDoor4NoGlue(a); a.run(40);
  const s = loadSchematic(exportSchem(a).buffer);
  const b = new World(); for (const x of s.blocks) b.setRaw(x.pos, x.type, x.props); b.run(40);
  assert.equal(b.listBlocks().length, a.listBlocks().length);
});
