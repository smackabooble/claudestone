import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { buildWorld, loadTrace, sigOf, toBlock } from '../tools/tracecmp.ts';

// Real-game trace of examples/microtests/copper-bulb.schem (26.2): replay a lever flip and compare every cell every tick.
const LEVER = [83, 6, -117] as [number, number, number];

function replay(phase: number, ticks: number): string[] {
  const tr = loadTrace('knowledge/refs/copper-bulb-real-trace.txt');
  const key = LEVER.join(',');
  const flips = tr.ticks.filter((t) => t.ch.some(([k, c]) => k === key && c.name === 'lever')).map((t) => t.t);
  const start = flips[phase];
  const all = new Map(tr.init);
  for (const t of tr.ticks) { if (t.t >= start) break; for (const [k, c] of t.ch) all.set(k, c); }
  const real = new Map<string, string>();
  const apply = (k: string, c: any) => { const b = toBlock(c); if (!b) real.delete(k); else real.set(k, sigOf(b.type, b.props)); };
  for (const [k, c] of all) apply(k, c);
  const w: World = buildWorld(all);
  w.run(2); w.use(LEVER);
  const bad: string[] = [];
  let simT = 0;
  for (const t of tr.ticks.filter((t) => t.t >= start && t.t - start <= ticks)) {
    for (const [k, c] of t.ch) apply(k, c);
    while (simT < t.t - start + 1) { w.run(1); simT++; }
    for (const k of new Set([...real.keys(), ...all.keys()])) {
      const [x, y, z] = k.split(',').map(Number); const b = w.get([x, y, z]);
      const a = real.get(k) ?? '', s = sigOf(b.type, b.p as any);
      if (a !== s) bad.push(`T+${t.t - start} ${k} real=${a || 'air'} sim=${s || 'air'}`);
    }
  }
  return bad;
}

test('copper bulb: sim equals the real game tick by tick (first ON, and the last flip)', () => {
  assert.deepEqual(replay(0, 40), []);
  assert.deepEqual(replay(7, 40), []);
});
