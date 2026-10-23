import { World } from '../src/world.ts';
import { buildGearSet } from './gear-set.ts';
const w = new World();
const m = buildGearSet(w);
w.setItem(m.blockChest[0], 0, { id: 'diamond_block', count: 16 });
w.setItem(m.logChest, 0, { id: 'oak_log', count: 8 });
const dump = (label: string) => {
  console.log('== ' + label);
  const seen = new Set<string>();
  for (const b of w.listBlocks() as any[]) {
    if (!['hopper', 'dropper', 'crafter', 'chest'].includes(b.type)) continue;
    const p = b.pos ?? b.p; const it: any[] = (w.items(p) ?? []) as any[];
    const t: Record<string, number> = {}; it.forEach((x) => { if (x) t[x.id.replace('diamond_', 'd_').replace('oak_', '')] = (t[x.id.replace('diamond_', 'd_').replace('oak_', '')] ?? 0) + x.count; });
    const s = JSON.stringify(t); if (s === '{}') continue;
    const key = b.type === 'chest' ? s + p.slice(0, 1) + p[2] : '';
    if (key && seen.has(key)) continue; seen.add(key);
    console.log(b.type.padEnd(8), p.join(','), s);
  }
};
const total = Number(process.argv[2] ?? 2600);
w.use(m.button);
for (let t = 0; t < total; t += 200) { w.run(200); if (t + 200 === total) dump('t=' + (t + 200)); }
