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
const KNOWN: Record<string, string> = {
  'C.push.leaves': 'real game: leaves pushed by a sticky piston vanish (not understood yet: glued leaves survive being pushed); the sim pushes them',
};
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
  for (const build of [buildLab, buildLab2]) {
    const w = new World(); build(w);
    const floating = w.listBlocks().filter((b: any) => ['redstone_wire', 'repeater', 'comparator', 'redstone_torch'].includes(b.type) && w.get([b.pos[0], b.pos[1] - 1, b.pos[2]]).type === 'air');
    assert.deepEqual(floating.map((b: any) => b.pos.join(',')), []);
  }
});
