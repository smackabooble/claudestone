import { World } from '../src/world.ts';
import { loadFast } from './gear-fast.ts';
import { runWithLifts } from './gear-lift.ts';
// diagnostic: run N presses and list every non-empty container after each one. usage: tsx examples/gear-set-diag.ts <presses> <gt per press>
const w = new World();
const m = loadFast(w);
w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 });
const short = (id: string) => id.replace('diamond_', 'd_').replace('oak_', '');
const dump = (label: string) => {
  console.log('== ' + label);
  const seen = new Set<string>();
  for (const b of w.listBlocks() as any[]) {
    if (!['hopper', 'dropper', 'crafter', 'chest'].includes(b.type)) continue;
    const p = b.pos ?? b.p; const it: any[] = (w.items(p) ?? []) as any[];
    const t: Record<string, number> = {}; it.forEach((x) => { if (x) t[short(x.id)] = (t[short(x.id)] ?? 0) + x.count; });
    const s = JSON.stringify(t); if (s === '{}') continue;
    const key = b.type === 'chest' ? s + p[0] + p[2] : '';
    if (key && seen.has(key)) continue; seen.add(key);
    console.log(b.type.padEnd(8), p.join(','), s);
  }
};
runWithLifts(w, m.lifts, 1500);
const presses = Number(process.argv[2] ?? 1), gt = Number(process.argv[3] ?? 5000);
for (let i = 1; i <= presses; i++) { w.use(m.platform.button); runWithLifts(w, m.lifts, gt); dump(`after press ${i}`); }
