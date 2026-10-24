import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildWaveArm, waveHome, waveTipX } from '../examples/wave-arm.ts';
import { buildWaveArmFast, fastHome, fastTipX } from '../examples/wave-arm-fast.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

for (const n of [5, 10, 12]) {
  test(`wave-controlled ${n}-long extender: reaches ${n} blocks and comes home, 3 cycles`, () => {
    const w = new World();
    const { lever } = buildWaveArm(w, n);
    w.run(400);
    assert.ok(waveHome(w, n), 'home at rest');
    for (let i = 0; i < 3; i++) {
      w.use(lever); w.run(600);
      assert.equal(waveTipX(w, n), 2 * n, `extended #${i}`);
      w.use(lever); w.run(900);
      assert.ok(waveHome(w, n), `home #${i}`);
    }
    assert.ok(w.listBlocks().length < 800, 'stays compact');
  });
}

test('wave-controlled 10-long extender works after export -> import (raw paste)', () => {
  const w = new World(); const { lever } = buildWaveArm(w, 10); w.run(400);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  for (const b of loadSchematic(buffer).blocks) w2.setRaw(b.pos, b.type, b.props);
  w2.run(400);
  const [ox, oy, oz] = [-origin[0], -origin[1], -origin[2]];
  const tip = () => { for (let x = -1; x < 40; x++) if (w2.get([x + ox, 1 + oy, oz]).type === 'stone') return x; return null; };
  assert.equal(tip(), 10);
  const L: [number, number, number] = [lever[0] + ox, lever[1] + oy, lever[2] + oz];
  w2.use(L); w2.run(600); assert.equal(tip(), 20);
  w2.use(L); w2.run(900); assert.equal(tip(), 10);
});

for (const n of [5, 10, 12]) {
  test(`FAST wave-controlled ${n}-long extender: reaches ${n} blocks and comes home, 3 cycles`, () => {
    const w = new World();
    const { lever } = buildWaveArmFast(w, n);
    w.run(400);
    assert.ok(fastHome(w, n), 'home at rest');
    for (let i = 0; i < 3; i++) {
      w.use(lever); w.run(400);
      assert.equal(fastTipX(w, n), 2 * n, `extended #${i}`);
      w.use(lever); w.run(700);
      assert.ok(fastHome(w, n), `home #${i}`);
    }
  });
}

test('FAST wave-controlled 12-long extender works after export -> import (raw paste)', () => {
  const w = new World(); const { lever } = buildWaveArmFast(w, 12); w.run(400);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  for (const b of loadSchematic(buffer).blocks) w2.setRaw(b.pos, b.type, b.props);
  w2.run(400);
  const [ox, oy, oz] = [-origin[0], -origin[1], -origin[2]];
  const tip = () => { for (let x = -1; x < 50; x++) if (w2.get([x + ox, 1 + oy, oz]).type === 'stone') return x; return null; };
  assert.equal(tip(), 12);
  const L: [number, number, number] = [lever[0] + ox, lever[1] + oy, lever[2] + oz];
  w2.use(L); w2.run(400); assert.equal(tip(), 24);
  w2.use(L); w2.run(700); assert.equal(tip(), 12);
});
