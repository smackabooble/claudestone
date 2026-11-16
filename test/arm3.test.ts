import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildFlatArm3, tipX3, home3 } from '../examples/flat-arm3.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

test('flat triple extender: tip travels 3 blocks out and fully back, 6 cycles', () => {
  const w = new World();
  const { lever } = buildFlatArm3(w);
  w.run(200);
  assert.ok(home3(w));
  for (let i = 0; i < 6; i++) {
    w.use(lever); w.run(100);
    assert.equal(tipX3(w), 6, `out #${i}`);
    w.use(lever); w.run(150);
    assert.ok(home3(w), `home #${i}`);
  }
});

test('triple extender works after export -> import (raw paste)', () => {
  const w = new World();
  const { lever } = buildFlatArm3(w);
  w.run(200);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  for (const b of loadSchematic(buffer).blocks) w2.setRaw(b.pos, b.type, b.props);
  w2.run(200);
  const L: [number, number, number] = [lever[0] - origin[0], lever[1] - origin[1], lever[2] - origin[2]];
  for (let i = 0; i < 2; i++) {
    w2.use(L); w2.run(100);
    let tip = -99;
    for (let x = -origin[0]; x < 14 - origin[0]; x++) if (w2.get([x, -origin[1], -origin[2]]).type === 'stone') tip = x + origin[0];
    assert.equal(tip, 6, 'tip out');
    w2.use(L); w2.run(150);
    tip = -99;
    for (let x = -origin[0]; x < 14 - origin[0]; x++) if (w2.get([x, -origin[1], -origin[2]]).type === 'stone') tip = x + origin[0];
    assert.equal(tip, 3, 'tip home');
  }
});
