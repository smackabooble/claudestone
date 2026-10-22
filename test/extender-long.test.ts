import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildFlatArm, homeN, tipXN } from '../examples/flat-armN.ts';
import { FAST, makeArmSpec, pulseOrder } from '../examples/extender-long.ts';

test('pulse order generator reproduces the hand-found orders', () => {
  assert.deepEqual(pulseOrder(3), [3, 1, 2]);
  assert.deepEqual(pulseOrder(5), [7, 5, 3, 1, 6, 4, 2, 5, 3, 4]);
});

for (const [n, fast] of [[6, false], [10, false], [10, true], [12, true]] as const) {
  test(`${n}-long extender${fast ? ' (fast)' : ''}: reaches ${n} blocks and comes home, twice`, () => {
    const spec = makeArmSpec(n, fast ? { timing: FAST } : {});
    const w = new World();
    const { lever } = buildFlatArm(w, spec);
    w.run(400);
    assert.ok(homeN(w, n), 'home after settling');
    const T = spec.pulses.at(-1)!.rear * 2 + 400;
    for (let i = 0; i < 2; i++) {
      w.use(lever); w.run(T);
      assert.equal(tipXN(w, n), 2 * n, `extended #${i}`);
      w.use(lever); w.run(T);
      assert.ok(homeN(w, n), `home #${i}`);
    }
  });
}

import { buildLayeredArm } from '../examples/flat-armN.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

const armAt = (w: World, n: number, y: number, ox = 0, oy = 0, oz = 0) => {
  let tip: number | null = null;
  for (let x = -1; x <= 3 * n + 2; x++) if (w.get([x + ox, y + oy, oz]).type === 'stone') { tip = x; break; }
  const home = tip === n && Array.from({ length: n }, (_, x) => x).every((x) => w.get([x + ox, y + oy, oz]).type === 'sticky_piston' && !w.read([x + ox, y + oy, oz], 'extended'));
  return { tip, home };
};

for (const [n, L] of [[6, 3], [10, 4]] as const) {
  test(`${n}-long extender stacked in ${L} layers: reaches ${n} blocks, comes home, survives export/import`, () => {
    const spec = makeArmSpec(n, { timing: FAST });
    const w = new World();
    const { lever } = buildLayeredArm(w, spec, L);
    const Y = 4 * (L - 1);
    w.run(400);
    assert.ok(armAt(w, n, Y).home, 'home after settling');
    const T = spec.pulses.at(-1)!.rear * 2 + 400;
    w.use(lever); w.run(T); assert.equal(armAt(w, n, Y).tip, 2 * n, 'extended');
    w.use(lever); w.run(T); assert.ok(armAt(w, n, Y).home, 'home again');
    // paste into a fresh world
    const { buffer, origin } = exportSchem(w);
    const w2 = new World();
    for (const b of loadSchematic(buffer).blocks) w2.setRaw(b.pos, b.type, b.props);
    w2.run(400);
    const [ox, oy, oz] = [-origin[0], -origin[1], -origin[2]];
    assert.ok(armAt(w2, n, Y, ox, oy, oz).home, 'home after paste');
    w2.use([lever[0] + ox, lever[1] + oy, lever[2] + oz]); w2.run(T);
    assert.equal(armAt(w2, n, Y, ox, oy, oz).tip, 2 * n, 'extended after paste');
  });
}
