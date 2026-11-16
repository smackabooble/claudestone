import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { DIRS, HORIZONTAL } from '../src/dirs.ts';

const TYPES = ['stone', 'glass', 'slime_block', 'redstone_block', 'redstone_wire', 'lever', 'stone_button',
  'redstone_torch', 'redstone_wall_torch', 'repeater', 'comparator', 'observer', 'redstone_lamp', 'piston',
  'sticky_piston', 'hopper', 'dropper', 'dispenser', 'chest', 'obsidian'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test('random builds never throw or hang (300 seeds x 100 ticks)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed);
    const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
    const w = new World();
    for (let n = 0; n < 60; n++) {
      const type = pick(TYPES);
      const props: Record<string, any> = {};
      if (['repeater', 'comparator', 'observer', 'piston', 'sticky_piston', 'redstone_wall_torch'].includes(type)) props.facing = pick(HORIZONTAL);
      if (['piston', 'sticky_piston', 'observer', 'dropper', 'dispenser', 'hopper'].includes(type)) props.facing = pick(DIRS);
      if (type === 'lever' || type === 'stone_button') { props.face = pick(['floor', 'wall', 'ceiling']); props.facing = pick(HORIZONTAL); }
      try { w.place([Math.floor(r() * 5), Math.floor(r() * 4), Math.floor(r() * 5)], type, props); } catch (e) {
        assert.match((e as Error).message, /no valid support/);
      }
      if (r() < 0.2) {
        const bl = w.listBlocks();
        if (bl.length) w.use(pick(bl).pos);
      }
      w.run(Math.floor(r() * 3));
    }
    w.run(100);
  }
});
