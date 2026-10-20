import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildUpright, tipY } from '../examples/double-piston-extender-vertical.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

const home = (w: World) =>
  tipY(w) === 2 && w.get([0, 0, 0]).type === 'sticky_piston' && w.get([0, 1, 0]).type === 'sticky_piston' &&
  !w.read([0, 0, 0], 'extended') && !w.read([0, 1, 0], 'extended');

test('upright extender: tip rises 2 blocks and fully back, 6 cycles', () => {
  const w = new World();
  const { lever } = buildUpright(w);
  w.run(40);
  assert.ok(home(w));
  for (let i = 0; i < 6; i++) {
    w.use(lever); w.run(40);
    assert.equal(tipY(w), 4, `up #${i}`);
    w.use(lever); w.run(60);
    assert.ok(home(w), `home #${i}`);
  }
});

test('upright extender works after export -> import', () => {
  const w = new World();
  const { lever } = buildUpright(w);
  w.run(40);
  const { buffer, origin } = exportSchem(w);
  const w2 = new World();
  for (const b of loadSchematic(buffer).blocks) w2.place(b.pos, b.type, b.props);
  w2.run(60);
  const o = (p: [number, number, number]): [number, number, number] => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
  w2.use(o(lever)); w2.run(40);
  assert.equal(w2.get(o([0, 4, 0])).type, 'stone', 'tip at y=4 after paste');
  w2.use(o(lever)); w2.run(60);
  assert.equal(w2.get(o([0, 2, 0])).type, 'stone', 'tip home after paste');
});
