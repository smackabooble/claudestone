import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildDoor10, isClosed10, isOpen10 } from '../examples/piston-door-10x10.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

const snapshot = (w: World) =>
  w.listBlocks().filter((b) => b.type === 'sticky_piston').map((b) => `${b.pos.join(',')}:${b.props.extended ?? ''}`).sort().join('|');
const glue = (w: World) => w.listBlocks().filter((b) => b.type === 'slime_block' || b.type === 'honey_block').length;

test('10x10 door: closes on build, opens/closes 3 times, mechanism returns to the same state', () => {
  const w = new World();
  const { lever, door } = buildDoor10(w);
  assert.equal(w.listBlocks().filter((b) => b.type === 'sticky_piston').length, 60);
  w.run(1500);
  assert.ok(isClosed10(w, door), 'closed after settling');
  const closedSnap = snapshot(w);
  let openSnap = '';
  for (let i = 0; i < 3; i++) {
    w.use(lever); w.run(1500);
    assert.ok(isOpen10(w, door), `open #${i}`);
    if (i === 0) openSnap = snapshot(w); else assert.equal(snapshot(w), openSnap);
    assert.equal(glue(w), 100);
    w.use(lever); w.run(1500);
    assert.ok(isClosed10(w, door), `closed #${i}`);
    assert.equal(snapshot(w), closedSnap);
  }
});

test('10x10 door works after export -> import (raw paste)', () => {
  const w = new World();
  const { lever, door } = buildDoor10(w);
  w.run(1500);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  for (const b of loadSchematic(buffer).blocks) w2.setRaw(b.pos, b.type, b.props);
  w2.run(1500);
  const sh = (p: [number, number, number]): [number, number, number] => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  const d2 = door.map(sh), L = sh(lever);
  assert.ok(isClosed10(w2, d2));
  w2.use(L); w2.run(1500); assert.ok(isOpen10(w2, d2));
  w2.use(L); w2.run(1500); assert.ok(isClosed10(w2, d2));
});
