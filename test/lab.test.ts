import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// the sim's answers for the lab (examples/lab-cells.txt, built by `npx tsx examples/lab.ts`): a few rules that must stay as modelled
const lab = JSON.parse(readFileSync('examples/lab-cells.txt', 'utf8'));
const cell = (id: string) => lab.cells.find((c: any) => c.id === id);
const on = (id: string): string[] => cell(id).probes.map((p: any) => p.sim.on);
const off = (id: string): string[] => cell(id).probes.map((p: any) => p.sim.off);

test('lab: has all five groups', () => {
  assert.ok(lab.cells.length > 150);
  assert.deepEqual([...new Set(lab.cells.map((c: any) => c.group))].sort(), ['conduction', 'dust support', 'piston push/pull', 'quasi-connectivity', 'slime glue']);
});

test('lab: conductors light the lamps, glass and leaves do not', () => {
  assert.equal(on('A.cond.stone')[0], 'redstone_lamp lit=true');
  assert.equal(on('A.cond.glass')[0], 'redstone_lamp lit=false');
  assert.equal(on('A.cond.leaves')[0], 'redstone_lamp lit=false');
});

test('lab: obsidian and furnaces are not pushed, stone is pushed and pulled back', () => {
  assert.deepEqual(on('C.push.obsidian').slice(1), ['obsidian', 'air']);
  assert.deepEqual(on('C.push.furnace').slice(1), ['furnace', 'air']);
  assert.deepEqual(on('C.push.stone').slice(1), ['piston_head', 'stone']);
  assert.deepEqual(off('C.push.stone').slice(1), ['stone', 'air']);
});

test('lab: quasi-connectivity needs a block update (BUD): with the note block kicker the piston extends, without it it stays', () => {
  assert.match(on('E.qc.piston.0,2,0.kick')[0], /extended=true/);
  assert.match(on('E.qc.piston.0,2,0.nokick')[0], /extended=false/);
  assert.match(on('E.qc.dropper.1,1,0.kick')[0], /triggered=true/);
  assert.match(on('E.qc.dropper.1,1,0.nokick')[0], /triggered=false/);
});

// real-game run 1 (knowledge/lab-real-1.json, Minecraft 26.3): after the lever ON / OFF the simulator must give the real answers.
// Not compared: the BEFORE phase (that snapshot was taken after an earlier flick), and one open question (see KNOWN).
const real = JSON.parse(readFileSync('knowledge/lab-real-1.json', 'utf8')).cells as Record<string, { before: string[]; on: string[]; off: string[] }>;
const KNOWN: Record<string, string> = {};
test('lab: the simulator matches the real game after lever ON and OFF (193 cells)', () => {
  const diffs: string[] = [];
  for (const c of lab.cells) {
    if (KNOWN[c.id]) continue;
    for (const ph of ['on', 'off'] as const) {
      const sim = c.probes.map((p: any) => p.sim[ph]);
      if (JSON.stringify(sim) !== JSON.stringify(real[c.id][ph])) diffs.push(`${c.id} ${ph}: sim ${sim.join(' | ')} real ${real[c.id][ph].join(' | ')}`);
    }
  }
  assert.deepEqual(diffs, []);
});

test('lab builds: no dust, repeater, comparator or floor torch floats in the air (it would pop on the first update)', async () => {
  const { World } = await import('../src/world.ts');
  const { buildLab } = await import('../examples/lab.ts');
  const { buildLab2 } = await import('../examples/lab2.ts');
  const { buildLab3 } = await import('../examples/lab3.ts');
  const { buildLab4 } = await import('../examples/lab4.ts');
  const { buildLab5 } = await import('../examples/lab5.ts');
  for (const build of [buildLab, buildLab2, buildLab3, buildLab4, buildLab5]) {
    const w = new World(); build(w);
    const floating = w.listBlocks().filter((b: any) => ['redstone_wire', 'repeater', 'comparator', 'redstone_torch'].includes(b.type) && w.get([b.pos[0], b.pos[1] - 1, b.pos[2]]).type === 'air');
    assert.deepEqual(floating.map((b: any) => b.pos.join(',')), []);
  }
});

test('lab 2: the simulator matches the real tick-by-tick recording of all 24 cells (knowledge/refs/lab2-real-2-rec.txt, 164 probe phases)', async () => {
  const { execSync } = await import('node:child_process');
  const out = execSync('npx tsx tools/labtrace.ts compare knowledge/refs/lab2-real-2-rec.txt -327,4,679', { encoding: 'utf8' });
  assert.match(out, /probe phases that differ: 0 of 164 \(incl\. initial states\); cells with a difference: 0 of 24/);
});

test('lab 3: the simulator matches the real recording (knowledge/refs/lab3-real-1-rec.txt); the ON phase was only stepped ~50 ticks, so C.levels and H.chain are compared up to there', async () => {
  const { execSync } = await import('node:child_process');
  const out = execSync('npx tsx tools/labtrace.ts compare knowledge/refs/lab3-real-1-rec.txt -461,5,677', { encoding: 'utf8', env: { ...process.env, LAB: 'lab3', ON_WINDOW: '50' } });
  const cells = out.split('\n').filter((l) => /^[A-Z]\.\S+$/.test(l.trim())).map((l) => l.trim()).sort();
  assert.deepEqual(cells, ['C.levels', 'H.chain']);          // only their OFF phase differs: the transfers that were still running when the lever was flicked again
});

test('lab 4: the simulator matches the real recording of all 6 cells (knowledge/refs/lab4-real-1-rec.txt, 54 probe phases)', async () => {
  const { execSync } = await import('node:child_process');
  const out = execSync('npx tsx tools/labtrace.ts compare knowledge/refs/lab4-real-1-rec.txt -532,19,783', { encoding: 'utf8', env: { ...process.env, LAB: 'lab4' } });
  assert.match(out, /probe phases that differ: 0 of 54 \(incl\. initial states\); cells with a difference: 0 of 6/);
});

// real item tracks of lab 5 (knowledge/refs/lab5-real-items.json): start the simulator's item entity from the first real sample and compare the next ticks
test('lab 5: item physics in water and in a bubble column follow the real tracks (height within 0.1 for 30 ticks)', async () => {
  const { World } = await import('../src/world.ts');
  const real = JSON.parse(readFileSync('knowledge/refs/lab5-real-items.json', 'utf8'));
  for (const [cell, kind] of [['W.plain', 'water'], ['W.bubble', 'bubble']] as const) {
    const s = real[cell].samples as number[][];
    const w = new World(); w.itemPhysics = true;
    const [ox, oy, oz] = real[cell].origin as number[];
    w.setRaw([ox + 2, oy - 1, oz], kind === 'bubble' ? 'soul_sand' : 'obsidian');
    for (let y = 0; y < 6; y++) {
      w.setRaw([ox + 2, oy + y, oz], kind === 'bubble' ? 'bubble_column' : 'water', kind === 'bubble' ? { drag: false } : { level: 0 });
      for (const [dx, dz] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) w.setRaw([ox + 2 + dx, oy + y, oz + dz], 'glass');
    }
    const [t0, x0, y0, z0, vx0, vy0, vz0] = s[0];
    w.ents3.push({ id: 1, x: x0, y: y0, z: z0, vx: vx0, vy: vy0, vz: vz0, item: { id: 'diamond', count: 1 }, age: 0, onGround: false });
    let worst = 0;
    for (const row of s.slice(1)) {
      if (row[2] > 6.2) break;                                   // leaves the 6-high column: the open top is the next lab question
      while (t0 + w.time - w.time < 0) break;
      w.run(1);
      const e = w.ents3[0]; if (!e) break;
      worst = Math.max(worst, Math.abs(e.y - row[2]));
    }
    assert.ok(worst < 0.1, `${cell}: worst height error ${worst.toFixed(3)}`);
  }
});

test('lab 5: block events match the real recording except the two known cells (knowledge/refs/lab5-real-1-rec.txt)', async () => {
  const { execSync } = await import('node:child_process');
  const out = execSync('npx tsx tools/labtrace.ts compare knowledge/refs/lab5-real-1-rec.txt -635,28,888', { encoding: 'utf8', env: { ...process.env, LAB: 'lab5' } });
  const cells = out.split('\n').filter((l) => /^[A-Z]\.\S+$/.test(l.trim())).map((l) => l.trim()).sort();
  // W.plain.soul: in the real game the plain water over soul sand turned into a bubble column 20 ticks after the dropper fired (trigger not modelled);
  // W.liftTop: the item arrived 3 ticks earlier (the dropper throw is random)
  assert.deepEqual(cells, ['W.liftTop', 'W.plain.soul']);
});

import { buildDemo } from '../examples/noteblocks-demo.ts';
import { playSong } from '../examples/noteblocks.ts';
test('noteblock song: notes sound at 2*t game ticks', () => {
  const { w, built } = buildDemo();
  const got = playSong(w, built, 100).map((n) => n.tick);
  assert.deepEqual(got, [0, 0, 0, 6, 12, 20, 20, 80]);
});

import { buildTriplePulse } from '../examples/triple-pulse.ts';
import { World as W2 } from '../src/world.ts';
test('button -> exactly 3 pulses (compact, no floor)', () => {
  const w = new W2(); const b = buildTriplePulse(w); w.run(20); w.use(b.button);
  let prev = false, ons = 0;
  for (let t = 0; t < 300; t++) { w.run(1); const l = !!w.get(b.out).p.powered; if (l && !prev) ons++; prev = l; }
  assert.equal(ons, 3);
});

import { toBlockState } from '../src/export.ts';
test('exported raw-placed dust is connected, never dots', () => {
  const w = new W2(); buildTriplePulse(w); w.settleWires();
  const dots = w.listBlocks().filter((b) => b.type === 'redstone_wire').filter((b) => toBlockState({ type: b.type, p: b.props }).includes('east=none,north=none,power=0,south=none,west=none'));
  assert.equal(dots.length, 0);
});

test('triple pulse: 3 even pulses, 20 gt apart, 8 gt wide', () => {
  const w = new W2(); const b = buildTriplePulse(w); w.run(20); w.use(b.button);
  const on: number[] = [], off: number[] = []; let prev = false;
  for (let t = 0; t < 150; t++) { w.run(1); const l = !!w.get(b.out).p.powered; if (l && !prev) on.push(t); if (!l && prev) off.push(t); prev = l; }
  assert.equal(on.length, 3);
  assert.equal(on[1] - on[0], 20); assert.equal(on[2] - on[1], 20);
  assert.deepEqual(off.map((o, i) => o - on[i]), [8, 8, 8]);
});
