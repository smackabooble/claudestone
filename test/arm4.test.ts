import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildFlatArm, QUAD, homeN, tipXN } from '../examples/flat-armN.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

test('flat quad extender: tip travels 4 blocks out and fully back, 4 cycles', () => {
  const w = new World();
  const { lever } = buildFlatArm(w, QUAD);
  w.run(300);
  assert.ok(homeN(w, 4));
  for (let i = 0; i < 4; i++) {
    w.use(lever); w.run(150);
    assert.equal(tipXN(w, 4), 8, `out #${i}`);
    w.use(lever); w.run(300);
    assert.ok(homeN(w, 4), `home #${i}`);
  }
});

test('quad extender works after export -> import (raw paste)', () => {
  const w = new World();
  const { lever } = buildFlatArm(w, QUAD);
  w.run(300);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  for (const b of loadSchematic(buffer).blocks) w2.setRaw(b.pos, b.type, b.props);
  w2.run(300);
  const L: [number, number, number] = [lever[0] - origin[0], lever[1] - origin[1], lever[2] - origin[2]];
  const tip = () => { for (let x = -3; x < 20; x++) if (w2.get([x - origin[0], -origin[1], -origin[2]]).type === 'stone') return x; return -99; };
  for (let i = 0; i < 2; i++) {
    w2.use(L); w2.run(150); assert.equal(tip(), 8);
    w2.use(L); w2.run(300); assert.equal(tip(), 4);
  }
});
