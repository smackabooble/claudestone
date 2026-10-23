import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildGearSet } from '../examples/gear-set.ts';
import { PAIRS } from '../examples/gear-set.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';
import { runWithLifts } from '../examples/gear-lift.ts';

// The full end-to-end run takes minutes (examples/gear-set-run.ts); this test builds the machine and runs the first slice.
const w = new World();
const m = buildGearSet(w);

test('gear set machine builds (17k blocks, 18 timelines, one output chest)', () => {
  assert.equal(m.timelines.length, 18);
  assert.ok(w.listBlocks().length > 10000);
  assert.equal(w.get(m.button).type, 'stone_button');
  assert.equal(w.get(m.outputs[0]).type, 'chest');
  assert.equal(PAIRS.length, 4);
  // 4 crafters for the blocks, 1 for the logs, 2 for sticks, 8 for the gear: 15 crafters
  assert.equal(w.listBlocks().filter((b) => b.type === 'crafter').length, 15);
});

test('gear set: START reaches all timelines in order, the log becomes 4 planks (first slice of one press)', () => {
  w.setItem(m.blockChest[0], 0, { id: 'diamond_block', count: 16 });
  w.setItem(m.logChest, 0, { id: 'oak_log', count: 4 });
  w.use(m.button);
  const seen: Record<string, number> = {};
  const pw = (p: any) => (((w.get(p) as any).p?.power ?? 0) > 0);
  for (let t = 0; t < 90; t += 2) {
    w.run(2);
    for (const tl of m.timelines.slice(0, 2)) if (pw(tl.start) && !(tl.name in seen)) seen[tl.name] = t;
    if (t <= 40) assert.ok(!pw(m.timelines[2].start), 'planks timelines are delayed');
  }
  assert.ok('tDM' in seen && 'tC2' in seen, `group-0 timelines start (${JSON.stringify(seen)})`);
  // the log chest was tapped once and the planks travel to the planks stash (count them over the whole machine)
  w.run(250);
  let planks = 0;
  for (const b of w.listBlocks()) {
    if (!['chest', 'hopper', 'dropper', 'crafter'].includes(b.type)) continue;
    if (b.type === 'chest' && b.props?.type === 'right') continue;       // right half shares the inventory with the left half
    for (const it of (w.items(b.pos) ?? []) as any[]) if (it && it.id === 'oak_planks') planks += it.count;
  }
  assert.equal(planks, 4, 'one log -> 4 planks');
});

test('gear set survives export -> import', () => {
  const s = loadSchematic(exportSchem(w).buffer);
  assert.equal(s.blocks.length, w.listBlocks().length);
});

const total = (p: any) => ((w.items(p) ?? []) as any[]).reduce((a, x) => a + (x ? x.count : 0), 0);

test('platform: four double chests with signs, a hopper under each input half, a START button on the deck', () => {
  const pl = m.platform;
  for (const c of [pl.diamonds, pl.logs, pl.output, pl.leftover]) { assert.equal(w.get(c[0]).type, 'chest'); assert.equal(w.get(c[1]).type, 'chest'); assert.equal(c[1][0], c[0][0] + 1); }
  for (const c of [...pl.diamonds, ...pl.logs]) assert.equal(w.get([c[0], c[1] - 1, c[2]]).type, 'hopper');
  for (const c of [...pl.output, ...pl.leftover]) assert.notEqual(w.get([c[0], c[1] - 1, c[2]]).type, 'hopper', 'no hopper may drain the output chests');
  assert.equal(w.get(pl.button).type, 'stone_button');
  assert.equal(w.listBlocks().filter((b) => b.type === 'oak_wall_sign').length, 5);
});

test('platform: DIAMONDS and LOGS drain down to the hub chests', () => {
  w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 8 });
  w.setItem(m.platform.logs[0], 1, { id: 'oak_log', count: 3 });
  w.run(1500);
  assert.equal(total(m.platform.diamonds[0]), 0);
  assert.equal(total(m.platform.logs[0]), 0);
  assert.ok(total(m.blockChest[0]) >= 4, 'blocks arrived in the hub chest');
});

test('lifts: items put in the ground OUTPUT / LEFTOVER chests reach the platform chests (water is a sim stand-in, not proven)', () => {
  assert.equal(m.lifts.length, 2);
  const kinds = new Set(w.listBlocks().map((b) => b.type));
  for (const t of ['water', 'soul_sand', 'glass']) assert.ok(kinds.has(t), t);
  const o0 = total(m.platform.output[0]), l0 = total(m.platform.leftover[0]);            // the press started above is still running
  w.setItem(m.outputs[0], 0, { id: 'diamond_sword', count: 1 });
  w.setItem(m.leftover[0], 0, { id: 'stick', count: 1 });
  runWithLifts(w, m.lifts, 1200);
  assert.ok(total(m.platform.output[0]) >= o0 + 1);
  assert.ok(total(m.platform.leftover[0]) >= l0 + 1);
});
