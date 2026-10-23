// diagnostic: shovel crafter slot contents over 2 presses
import { World } from '../src/world.ts';
import { loadGearSet } from './gear-set.ts';
const w = new World();
const m = loadGearSet(w);
w.setItem(m.blockChest[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.logChest, 0, { id: 'oak_log', count: 16 });
const C: [number, number, number] = [-12, 0, 22];
const show = () => ((w.items(C) ?? []) as any[]).map((x, i) => x ? `${i}:${x.id.replace('diamond_', 'd_')}x${x.count}` : '').filter(Boolean).join(' ');
let last = '';
for (let p = 0; p < 2; p++) { w.use(m.button); for (let t = 0; t < 9000; t += 2) { w.run(2); const s = show(); if (s !== last) { console.log(p, t, s); last = s; } } }
