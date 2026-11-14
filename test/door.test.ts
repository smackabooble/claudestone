import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildDoor } from '../examples/piston-door-2x2.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';
import type { Pos } from '../src/dirs.ts';

const all = (w: World, door: Pos[], type: string) => door.every((p) => w.get(p).type === type);

test('2x2 piston door opens and closes repeatedly', () => {
  const w = new World();
  const { lever, door } = buildDoor(w);
  w.run(40);
  assert.ok(all(w, door, 'stone'));
  for (let i = 0; i < 5; i++) {
    w.use(lever); w.run(20);
    assert.ok(all(w, door, 'air'), `open #${i}`);
    w.use(lever); w.run(20);
    assert.ok(all(w, door, 'stone'), `closed #${i}`);
  }
});

test('door survives export -> import round trip and still works', () => {
  const w = new World();
  const { lever, door } = buildDoor(w);
  w.run(40);
  const { buffer, origin } = exportSchem(w);
  const sch = loadSchematic(buffer);
  const w2 = new World();
  for (const b of sch.blocks) w2.setRaw(b.pos, b.type, b.props);
  w2.run(60);
  const off = (p: Pos): Pos => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  assert.ok(all(w2, door.map(off), 'stone'), 'closed after paste');
  w2.use(off(lever)); w2.run(20);
  assert.ok(all(w2, door.map(off), 'air'), 'opens after paste');
});
