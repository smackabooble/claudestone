import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildLampDisplay, LAMP_ON } from '../examples/lamp-display.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

const SEGS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

test('lamp display: every button shows its digit, in any order', () => {
  const w = new World(); const l = buildLampDisplay(w); w.run(100);
  w.use(l.clr); w.run(120);
  assert.equal(LAMP_ON(w, l), '');
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 3, 7, 0, 8, 1]) {
    w.use(l.buttons[n]); w.run(120);
    assert.equal(LAMP_ON(w, l), SEGS[n], `digit ${n}`);
  }
  w.use(l.clr); w.run(120);
  assert.equal(LAMP_ON(w, l), '');
});

test('lamp display works after export -> import (raw paste)', () => {
  const w = new World(); const l = buildLampDisplay(w); w.run(100); w.use(l.clr); w.run(120); w.use(l.buttons[5]); w.run(150);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  for (const b of loadSchematic(buffer).blocks) w2.setRaw(b.pos, b.type, b.props);
  w2.run(200);
  const sh = (p: [number, number, number]): [number, number, number] => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  const l2 = { buttons: l.buttons.map(sh), clr: sh(l.clr), lamps: Object.fromEntries(Object.entries(l.lamps).map(([k, v]) => [k, v.map(sh)])) };
  assert.equal(LAMP_ON(w2, l2), SEGS[5]);
  for (const n of [2, 9, 0]) { w2.use(l2.buttons[n]); w2.run(120); assert.equal(LAMP_ON(w2, l2), SEGS[n], `digit ${n}`); }
});
