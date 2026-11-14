// watch one crafter's slots over a press (after one cold press with crafters cleared). usage: tsx gear-fast-watch.ts x y z
import { World } from '../src/world.ts';
import { loadFast } from './gear-fast.ts';
import { runWithLifts } from './gear-lift.ts';
const w = new World();
const m = loadFast(w);
w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 });
runWithLifts(w, m.lifts, 1500);
const clear = () => { for (const b of w.listBlocks() as any[]) if (b.type === 'crafter') for (let i = 0; i < 9; i++) w.setItem(b.pos, i, null); };
for (let k = 0; k < Number(process.env.PRE ?? 1); k++) { w.use(m.platform.button); runWithLifts(w, m.lifts, 4000); clear(); }
const C = process.argv.slice(2, 5).map(Number) as [number, number, number];
const show = () => ((w.items(C) ?? []) as any[]).map((x, i) => x ? `${i}:${x.id.replace('diamond_', 'd_')}x${x.count}` : '').filter(Boolean).join(' ');
w.use(m.platform.button);
let last = '';
for (let t = 0; t < 3000; t += 2) { runWithLifts(w, m.lifts, 2); const s = show(); if (s !== last) { console.log(t, s); last = s; } }
