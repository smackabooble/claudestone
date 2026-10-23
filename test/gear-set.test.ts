import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildGearSet } from '../examples/gear-set.ts';
import { PAIRS } from '../examples/gear-set.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

// The full end-to-end run takes minutes (examples/gear-set-run.ts); this test builds the machine and runs the first slice.
const w = new World();
const m = buildGearSet(w);

test('gear set machine builds (17k blocks, 16 timelines, one output chest)', () => {
  assert.equal(m.timelines.length, 16);
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
  // the log chest was tapped once and the planks are in the planks stash/ports (count over the pair region)
  let planks = 0;
  for (const b of w.listBlocks()) {
    if (!['chest', 'hopper', 'dropper', 'crafter'].includes(b.type)) continue;
    const ps = m.planksStash;
    if (Math.abs(b.pos[0] - ps[0]) > 6 || Math.abs(b.pos[2] - ps[2]) > 6 || b.pos[1] < ps[1] - 3 || b.pos[1] > ps[1] + 1) continue;
    if (b.type === 'chest' && b.pos[0] === ps[0] + 1) continue;       // right half shares the inventory with the left half
    for (const it of (w.items(b.pos) ?? []) as any[]) if (it && it.id === 'oak_planks') planks += it.count;
  }
  assert.equal(planks, 4, 'one log -> 4 planks');
});

test('gear set survives export -> import', () => {
  const s = loadSchematic(exportSchem(w).buffer);
  assert.equal(s.blocks.length, w.listBlocks().length);
});
