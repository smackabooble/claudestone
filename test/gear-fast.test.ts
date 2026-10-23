import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildFast } from '../examples/gear-fast.ts';
import { runWithLifts } from '../examples/gear-lift.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

// The compact gear set builds in seconds and one full press (after priming) takes about a minute of simulation.
const w = new World();
const m = buildFast(w);
const total = (p: any) => ((w.items(p) ?? []) as any[]).reduce((a, x) => a + (x ? x.count : 0), 0);
const count = (p: any) => { const t: Record<string, number> = {}; for (const x of (w.items(p) ?? []) as any[]) if (x) t[x.id] = (t[x.id] ?? 0) + x.count; return t; };

test('compact gear set builds: 18 timelines, 15 crafters, platform with 4 chests + 5 signs, 2 lifts, small box', () => {
  assert.equal(m.timelines.length, 18);
  assert.equal(w.listBlocks().filter((b) => b.type === 'crafter').length, 15);
  assert.equal(w.get(m.platform.button).type, 'stone_button');
  assert.equal(w.listBlocks().filter((b) => b.type === 'oak_wall_sign').length, 5);
  for (const c of [m.platform.diamonds, m.platform.logs, m.platform.output, m.platform.leftover]) assert.equal(w.get(c[0]).type, 'chest');
  assert.equal(m.lifts.length, 2);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const b of w.listBlocks()) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], b.pos[i]); hi[i] = Math.max(hi[i], b.pos[i]); }
  const vol = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
  assert.ok(vol < 700_000, `bounding box ${vol} (the stacked spread-out version was 1.5M)`);
});

test('compact gear set: items put on the platform drain down into the hub chests', () => {
  const w2 = new World(); const m2 = buildFast(w2);
  w2.setItem(m2.platform.diamonds[0], 0, { id: 'diamond_block', count: 8 });
  w2.setItem(m2.platform.logs[0], 0, { id: 'oak_log', count: 3 });
  runWithLifts(w2, m2.lifts, 1200);
  const tot = (p: any) => ((w2.items(p) ?? []) as any[]).reduce((a, x) => a + (x ? x.count : 0), 0);
  assert.equal(tot(m2.platform.diamonds[0]), 0);
  assert.equal(tot(m2.platform.logs[0]), 0);
});

test('compact gear set: a primed press gives one full set (8 items) + 3 diamonds and 1 stick in the leftover chest, within 1300 gt', () => {
  const fill = () => { w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 }); w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 }); };
  const empty = (p: any) => { for (let i = 0; i < 54; i++) w.setItem(p, i, null); };
  const clearCrafters = () => { for (const b of w.listBlocks() as any[]) if (b.type === 'crafter') for (let i = 0; i < 9; i++) w.setItem(b.pos, i, null); };
  fill(); runWithLifts(w, m.lifts, 1500);
  for (let i = 0; i < 2; i++) { w.use(m.platform.button); runWithLifts(w, m.lifts, 4000); clearCrafters(); }
  runWithLifts(w, m.lifts, 3000);
  for (const c of [m.outputs[0], ...m.platform.output, ...m.platform.leftover, ...m.leftover, m.blockChest[0], m.logChest, ...m.platform.diamonds, ...m.platform.logs]) empty(c);
  fill(); runWithLifts(w, m.lifts, 1500);
  const left0 = count(m.platform.leftover[0]);
  w.use(m.platform.button);
  let done = -1;
  for (let t = 0; t < 2000; t += 8) { runWithLifts(w, m.lifts, 8); if (done < 0 && Object.keys(count(m.platform.output[0])).length >= 8) done = t + 8; }
  const out = count(m.platform.output[0]);
  for (const k of ['helmet', 'chestplate', 'leggings', 'boots', 'sword', 'pickaxe', 'axe', 'shovel']) assert.equal(out['diamond_' + k], 1, k);
  assert.equal(Object.keys(out).length, 8, JSON.stringify(out));
  assert.ok(done > 0 && done <= 1300, `all 8 items after ${done} gt`);
  void left0; void total;
  const left = count(m.platform.leftover[0]);
  assert.equal(left.diamond, 3); assert.equal(left.stick, 1);
});

test('compact gear set survives export -> import', () => {
  const s = loadSchematic(exportSchem(w).buffer);
  assert.equal(s.blocks.length, w.listBlocks().length);
});
