import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildElevator, elevHome, elevTop } from '../examples/elevator.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

for (const n of [4, 6]) {
  test(`piston elevator N=${n}: platform rises ${n} blocks and comes home, 2 cycles`, () => {
    const w = new World();
    const { lever } = buildElevator(w, n);
    w.run(500);
    assert.ok(elevHome(w, n), 'home at rest');
    for (let i = 0; i < 2; i++) {
      w.use(lever); w.run(300);
      assert.equal(elevTop(w, n), 1 + 2 * n, `risen #${i}`);
      w.use(lever); w.run(700);
      assert.ok(elevHome(w, n), `home #${i}`);
    }
  });
}

test('piston elevator works after export -> import (raw paste)', () => {
  const n = 6;
  const w = new World(); const { lever } = buildElevator(w, n); w.run(500);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  for (const b of loadSchematic(buffer).blocks) w2.setRaw(b.pos, b.type, b.props);
  w2.run(500);
  const [ox, oy, oz] = [-origin[0], -origin[1], -origin[2]];
  const top = () => { for (let y = 0; y < 60; y++) if (w2.get([ox, y + oy, oz]).type === 'stone') return y; return null; };
  assert.equal(top(), 1 + n);
  const L: [number, number, number] = [lever[0] + ox, lever[1] + oy, lever[2] + oz];
  w2.use(L); w2.run(300); assert.equal(top(), 1 + 2 * n);
  w2.use(L); w2.run(700); assert.equal(top(), 1 + n);
});
