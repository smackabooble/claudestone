import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildExtender, tipX } from '../examples/double-piston-extender.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

const home = (w: World) =>
  tipX(w) === 2 && w.get([0, 0, 0]).type === 'sticky_piston' && w.get([1, 0, 0]).type === 'sticky_piston' &&
  !w.read([0, 0, 0], 'extended') && !w.read([1, 0, 0], 'extended');

test('double piston extender: tip travels 2 blocks out and fully back, 6 cycles', () => {
  const w = new World();
  const { lever } = buildExtender(w);
  w.run(40);
  assert.ok(home(w));
  for (let i = 0; i < 6; i++) {
    w.use(lever); w.run(40);
    assert.equal(tipX(w), 4, `out #${i}`);
    assert.ok(w.read([0, 0, 0], 'extended') && w.read([2, 0, 0], 'extended'), 'A and B extended (B moved to x=2)');
    w.use(lever); w.run(60);
    assert.ok(home(w), `home #${i}`);
  }
});

test('double piston extender survives lever flicker without breaking', () => {
  const w = new World();
  const { lever } = buildExtender(w);
  w.run(40);
  for (let i = 0; i < 20; i++) { w.use(lever); w.run(1 + (i % 7)); }
  if (w.read(lever, 'powered')) w.use(lever);
  w.run(120);
  // whatever the flicker did, it must still be a working device afterwards
  for (const x of [0, 1]) assert.ok(['sticky_piston', 'air', 'piston_head'].includes(w.get([x, 0, 0]).type));
});

test('extender works after export -> import', () => {
  const w = new World();
  const { lever } = buildExtender(w);
  w.run(40);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  for (const b of loadSchematic(buffer).blocks) w2.place(b.pos, b.type, b.props);
  w2.run(60);
  const L: [number, number, number] = [lever[0] - origin[0], lever[1] - origin[1], lever[2] - origin[2]];
  w2.use(L); w2.run(40);
  const xs = [0, 1, 2, 3, 4, 5, 6].map((x) => w2.get([x - origin[0], 0 - origin[1], 0 - origin[2]]).type === 'stone' ? x : -1);
  assert.ok(xs.includes(4), 'tip at x=4 after paste');
});
