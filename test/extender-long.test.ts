import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildFlatArm, homeN, tipXN } from '../examples/flat-armN.ts';
import { makeArmSpec, pulseOrder } from '../examples/extender-long.ts';

test('pulse order generator reproduces the hand-found orders', () => {
  assert.deepEqual(pulseOrder(3), [3, 1, 2]);
  assert.deepEqual(pulseOrder(5), [7, 5, 3, 1, 6, 4, 2, 5, 3, 4]);
});

for (const n of [6, 10]) {
  test(`${n}-long extender: reaches ${n} blocks and comes home, twice`, () => {
    const spec = makeArmSpec(n);
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
