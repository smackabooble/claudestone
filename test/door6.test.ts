import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildDoor6, isClosed, isOpen } from '../examples/piston-door-6x6.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

const snapshot = (w: World) =>
  w.listBlocks().filter((b) => b.type === 'sticky_piston' || b.type === 'observer').map((b) => `${b.pos.join(',')}:${b.type}:${b.props.extended ?? ''}`).sort().join('|');
const pistons = (w: World) => w.listBlocks().filter((b) => b.type === 'sticky_piston').length;

test('6x6 door: closes on build, opens/closes 3 times, mechanism returns to the same state', () => {
  const w = new World();
  const { lever, door } = buildDoor6(w);
  const n = pistons(w);
  assert.equal(n, 3 * 2 + 3 * 4);
  w.run(800);
  assert.ok(isClosed(w, door), 'closed after settling');
  const closedSnap = snapshot(w);
  let openSnap = '';
  for (let i = 0; i < 3; i++) {
    w.use(lever); w.run(800);
    assert.ok(isOpen(w, door), `open #${i}`);
    if (i === 0) openSnap = snapshot(w); else assert.equal(snapshot(w), openSnap, 'open state repeats');
    assert.equal(pistons(w), n, 'no piston lost or dragged away');
    w.use(lever); w.run(800);
    assert.ok(isClosed(w, door), `closed #${i}`);
    assert.equal(snapshot(w), closedSnap, 'closed state repeats');
  }
});

test('6x6 door: slime+honey count stays 36 (nothing lost or duplicated)', () => {
  const w = new World();
  const { lever, door } = buildDoor6(w);
  w.run(800);
  const count = (t: string) => w.listBlocks().filter((b) => b.type === t).length;
  assert.equal(count('slime_block') + count('honey_block'), 36);
  w.use(lever); w.run(800);
  assert.equal(count('slime_block') + count('honey_block'), 36);
  assert.ok(isOpen(w, door));
});

test('6x6 door works after export -> import (raw paste)', () => {
  const w = new World();
  const { lever, door } = buildDoor6(w);
  w.run(800);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  for (const b of loadSchematic(buffer).blocks) w2.setRaw(b.pos, b.type, b.props);
  w2.run(300);
  const sh = (p: [number, number, number]): [number, number, number] => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  const d2 = door.map(sh);
  const L = sh(lever);
  assert.ok(isClosed(w2, d2), 'closed after paste');
  w2.use(L); w2.run(800); assert.ok(isOpen(w2, d2), 'open');
  w2.use(L); w2.run(800); assert.ok(isClosed(w2, d2), 'closed again');
});
