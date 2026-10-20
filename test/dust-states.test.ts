import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildExtender } from '../examples/double-piston-extender.ts';
import { buildUpright } from '../examples/double-piston-extender-vertical.ts';
import { buildDoor } from '../examples/piston-door-2x2.ts';
import { buildDoor3 } from '../examples/piston-door-3x3.ts';
import { buildDoor4 } from '../examples/piston-door-4x4.ts';

const SIDES = ['north', 'east', 'south', 'west'];

// Dust shapes must be exactly what vanilla would compute for the same surroundings (no stale/impossible states).
for (const [name, build] of [['flat extender', buildExtender], ['upright extender', buildUpright], ['piston door', buildDoor], ['3x3 piston door', buildDoor3], ['4x4 piston door', buildDoor4]] as const) {
  test(`${name}: every dust shape matches a fresh vanilla placement`, () => {
    const w: any = new World();
    (build as (w: World) => unknown)(w);
    w.run(60);
    for (const b of w.listBlocks()) {
      if (b.type !== 'redstone_wire') continue;
      const stored = w.sidesOf({ type: b.type, p: b.props });
      let fresh = w.wireRegulate({ north: 'none', east: 'none', south: 'none', west: 'none' }, b.pos);
      if (w.sidesDot(fresh)) fresh = w.sidesCross();
      for (const d of SIDES) assert.equal(stored[d], fresh[d], `${name} dust at ${b.pos.join(',')} side ${d}`);
    }
  });
}
