/**
 * Builds the gear set, lets it run two presses so every hopper, dropper and crafter holds its steady-state stray items, empties the
 * output chest, refills the input chests and exports the schematic. Press 1 of that schematic then gives a full set.
 * usage: npx tsx examples/gear-set-prime.ts   (about 15 min of simulation)
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { loadFast } from './gear-fast.ts';
import { runWithLifts } from './gear-lift.ts';

const w = new World();
const m = loadFast(w);
const fill = () => { w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 }); w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 }); };
const empty = (p: any) => { for (let i = 0; i < 54; i++) w.setItem(p, i, null); };
const count = (p: any) => { const t: Record<string, number> = {}; for (const x of (w.items(p) ?? []) as any[]) if (x) t[x.id] = (t[x.id] ?? 0) + x.count; return t; };
fill(); runWithLifts(w, m.lifts, 1500);
const PRESS_GT = Number(process.env.PRESS_GT ?? 4000);
const PRIME_GT = Number(process.env.PRIME_GT ?? 4000);
// a cold first press can leave a half-filled crafter (a short stick delivery); clear those so the primed press starts clean
const clearCrafters = () => { for (const b of w.listBlocks() as any[]) if (b.type === 'crafter') for (let i = 0; i < 9; i++) w.setItem(b.pos, i, null); };
for (let i = 1; i <= Number(process.env.PRIME_N ?? 7); i++) { w.use(m.platform.button); runWithLifts(w, m.lifts, PRIME_GT); console.log('priming press', i, JSON.stringify(count(m.platform.output[0]))); clearCrafters(); }
runWithLifts(w, m.lifts, 3000);                                              // let the output conveyor finish
for (const c of [m.outputs[0], ...m.platform.output, ...m.platform.leftover, ...m.leftover]) empty(c); empty(m.blockChest[0]); empty(m.logChest); for (const c of [...m.platform.diamonds, ...m.platform.logs]) empty(c); fill();
const OUT = process.env.OUT ?? 'examples/diamond-gear-set-fast.schem';
writeFileSync(OUT, exportSchem(w).buffer);
console.log('wrote ' + OUT + ' (primed)');
// check: the very next press must give one full set
runWithLifts(w, m.lifts, 1500);
w.use(m.platform.button);
let done = -1;
for (let t = 0; t < PRESS_GT + 2000; t += 8) { runWithLifts(w, m.lifts, 8); if (done < 0 && Object.keys(count(m.platform.output[0])).length >= 8) done = t + 8; }
console.log('first press after priming:', JSON.stringify(count(m.platform.output[0])), 'all 8 items after', done, 'gt');
