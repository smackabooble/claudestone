import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildDoor4 } from '../examples/piston-door-4x4.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';
import type { Pos } from '../src/dirs.ts';

const closed = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'stone');
const open = (w: World, door: Pos[]) => door.every((p) => w.get(p).type === 'air');
const STATIC = new Set(['obsidian', 'glass']);
const snap = (w: World) => w.listBlocks().filter((b) => STATIC.has(b.type)).map((b) => b.pos.join(',')).sort().join(';');
const count = (w: World, t: string) => w.listBlocks().filter((b) => b.type === t).length;

// every cell of the doorway tunnel (all of z=-1..2) must be empty when open
const tunnel: Pos[] = [];
for (let x = 0; x <= 3; x++) for (let y = 1; y <= 4; y++) for (let z = -2; z <= 2; z++) tunnel.push([x, y, z]);

test('4x4 door: opens and closes 6 times, tunnel fully clear, nothing dragged along', () => {
  const w = new World();
  const { lever, door } = buildDoor4(w);
  w.run(150);
  assert.ok(closed(w, door), 'closed after settling');
  const before = snap(w);
  const [stone, slime, honey] = ['stone', 'slime_block', 'honey_block'].map((t) => count(w, t));
  for (let i = 0; i < 6; i++) {
    w.use(lever); w.run(80);
    assert.ok(open(w, door), `open #${i}`);
    for (const p of tunnel) assert.equal(w.get(p).type, 'air', `tunnel clear at ${p} (open #${i})`);
    w.use(lever); w.run(80);
    assert.ok(closed(w, door), `closed #${i}`);
  }
  assert.equal(snap(w), before, 'obsidian/glass untouched');
  assert.equal(count(w, 'stone'), stone);
  assert.equal(count(w, 'slime_block'), slime);
  assert.equal(count(w, 'honey_block'), honey);
});

test('4x4 door: lever toggled again 50 ticks after the previous change', () => {
  const w = new World();
  const { lever, door } = buildDoor4(w);
  w.run(150);
  for (let i = 0; i < 4; i++) {
    w.use(lever); w.run(50);
    assert.ok(open(w, door), `open #${i}`);
    w.use(lever); w.run(50);
    assert.ok(closed(w, door), `closed #${i}`);
  }
});

test('4x4 door: survives export -> import and still works', () => {
  const w = new World();
  const { lever, door } = buildDoor4(w);
  w.run(150);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  for (const b of loadSchematic(buffer).blocks) {
    w2.setRaw(b.pos, b.type, b.props);
  }
  w2.run(200);
  const o = (p: Pos): Pos => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  assert.ok(closed(w2, door.map(o)), 'closed after paste');
  w2.use(o(lever)); w2.run(80);
  assert.ok(open(w2, door.map(o)), 'opens after paste');
  w2.use(o(lever)); w2.run(80);
  assert.ok(closed(w2, door.map(o)), 'closes after paste');
});
