// diagnostic: watch the stick splitter (x1 feed pair) around its pulses. usage: tsx examples/gear-set-s0s.ts
import { World } from '../src/world.ts';
import { loadGearSet } from './gear-set.ts';
const w = new World();
const m = loadGearSet(w);
w.setItem(m.blockChest[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.logChest, 0, { id: 'oak_log', count: 16 });
w.use(m.button); w.run(9000); w.use(m.button);
const snap = () => {
  const o: string[] = [];
  for (const b of w.listBlocks() as any[]) {
    if (!['hopper', 'dropper', 'chest'].includes(b.type)) continue;
    const p = b.pos ?? b.p; if (p[0] < -26 || p[0] > -12 || p[1] < 4 || p[1] > 6 || p[2] < 8 || p[2] > 24) continue;
    const n = ((w.items(p) ?? []) as any[]).reduce((a, x) => a + (x?.id === 'stick' ? x.count : 0), 0);
    if (n) o.push(`${b.type[0]}${p.join(',')}:${n}`);
  }
  return o.join(' ');
};
let last = '';
for (let t = 0; t < 900; t += 2) { w.run(2); const s = snap(); if (s !== last) { console.log(t, s); last = s; } }
