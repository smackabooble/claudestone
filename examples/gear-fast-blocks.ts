// trace the diamond blocks through the trunk during press 2 (after a cold press and clearing the crafters)
import { World } from '../src/world.ts';
import { loadFast } from './gear-fast.ts';
import { runWithLifts } from './gear-lift.ts';
const w = new World();
const m = loadFast(w);
w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 });
runWithLifts(w, m.lifts, 1500);
const clear = () => { for (const b of w.listBlocks() as any[]) if (b.type === 'crafter') for (let i = 0; i < 9; i++) w.setItem(b.pos, i, null); };
const where = () => {
  const o: string[] = [];
  for (const b of w.listBlocks() as any[]) {
    if (!['hopper', 'dropper', 'crafter', 'chest'].includes(b.type)) continue;
    const n = ((w.items(b.pos) ?? []) as any[]).reduce((a, x) => a + (x && x.id === 'diamond_block' ? x.count : 0), 0);
    if (n && !(b.pos[1] === 18 || b.pos[1] === 16 && b.type === 'chest')) o.push(`${b.type[0]}${b.pos.join(',')}:${n}`);
  }
  return o.join(' ');
};
w.use(m.platform.button); runWithLifts(w, m.lifts, 4000); clear();
console.log('after press 1 + clear:', where());
w.use(m.platform.button);
let last = '';
for (let t = 0; t < 900; t += 4) { runWithLifts(w, m.lifts, 4); const s = where(); if (s !== last) { console.log(t, s); last = s; } }
