import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// the sim's answers for the lab (examples/lab.json, built by `npx tsx examples/lab.ts`): a few rules that must stay as modelled
const lab = JSON.parse(readFileSync('examples/lab.json', 'utf8'));
const cell = (id: string) => lab.cells.find((c: any) => c.id === id);
const on = (id: string) => cell(id).probes.map((p: any) => p.sim.on).join(' | ');

test('lab: has all five groups and the lever', () => {
  assert.ok(lab.cells.length > 150);
  assert.deepEqual([...new Set(lab.cells.map((c: any) => c.group))].sort(), ['conduction', 'dust support', 'piston push/pull', 'quasi-connectivity', 'slime glue']);
});

test('lab: conductors light the lamps, glass and leaves do not', () => {
  assert.match(on('A.cond.stone'), /lamp east: redstone_lamp lit=true/);
  assert.match(on('A.cond.glass'), /lamp east: redstone_lamp lit=false/);
  assert.match(on('A.cond.leaves'), /lamp east: redstone_lamp lit=false/);
});

test('lab: obsidian and furnaces are not pushed, stone is pushed and pulled back', () => {
  assert.match(on('C.push.obsidian'), /target start: obsidian/);
  assert.match(on('C.push.furnace'), /target start: furnace/);
  assert.match(on('C.push.stone'), /target pushed: stone/);
  const off = cell('C.push.stone').probes.map((p: any) => p.sim.off).join(' | ');
  assert.match(off, /target start: stone/);
});

test('lab: quasi-connectivity needs a block update (BUD): with the note block kicker the piston extends, without it it stays', () => {
  assert.match(on('E.qc.piston.0,2,0.kick'), /extended=true/);
  assert.match(on('E.qc.piston.0,2,0.nokick'), /extended=false/);
  assert.match(on('E.qc.dropper.1,1,0.kick'), /triggered=true/);
  assert.match(on('E.qc.dropper.1,1,0.nokick'), /triggered=false/);
});
