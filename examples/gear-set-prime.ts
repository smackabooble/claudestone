/**
 * Builds the gear set, lets it run two presses so every hopper, dropper and crafter holds its steady-state stray items, empties the
 * output chest, refills the input chests and exports the schematic. Press 1 of that schematic then gives a full set.
 * usage: npx tsx examples/gear-set-prime.ts   (about 15 min of simulation)
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { loadGearSet } from './gear-set.ts';

const w = new World();
const m = loadGearSet(w);
const fill = () => { w.setItem(m.blockChest[0], 0, { id: 'diamond_block', count: 64 }); w.setItem(m.logChest, 0, { id: 'oak_log', count: 16 }); };
const empty = (p: any) => { for (let i = 0; i < 54; i++) w.setItem(p, i, null); };
const count = (p: any) => { const t: Record<string, number> = {}; for (const x of (w.items(p) ?? []) as any[]) if (x) t[x.id] = (t[x.id] ?? 0) + x.count; return t; };
fill();
const PRESS_GT = 6000;
for (let i = 1; i <= 2; i++) { w.use(m.button); w.run(PRESS_GT); console.log('priming press', i, JSON.stringify(count(m.outputs[0]))); }
w.run(2000);                                              // let the output conveyor finish
empty(m.outputs[0]); empty(m.blockChest[0]); empty(m.logChest); fill();
writeFileSync('examples/diamond-gear-set.schem', exportSchem(w).buffer);
console.log('wrote examples/diamond-gear-set.schem (primed)');
// check: the very next press must give one full set
w.use(m.button); w.run(PRESS_GT + 2000);
console.log('first press after priming:', JSON.stringify(count(m.outputs[0])));
