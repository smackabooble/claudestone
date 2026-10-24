// press after press with the crafters cleared in between (what priming does); prints the items per press. usage: tsx gear-fast-seq.ts [presses=5] [gt=4000]
import { World } from '../src/world.ts';
import { loadFast } from './gear-fast.ts';
import { runWithLifts } from './gear-lift.ts';
const w = new World();
const m = loadFast(w);
w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 });
runWithLifts(w, m.lifts, 1500);
const clear = () => { for (const b of w.listBlocks() as any[]) if (b.type === 'crafter') for (let i = 0; i < 9; i++) w.setItem(b.pos, i, null); };
const count = (p: any) => { const t: Record<string, number> = {}; for (const x of (w.items(p) ?? []) as any[]) if (x) t[x.id] = (t[x.id] ?? 0) + x.count; return t; };
let prev: Record<string, number> = {};
for (let i = 1; i <= Number(process.argv[2] ?? 5); i++) {
  w.use(m.platform.button); runWithLifts(w, m.lifts, Number(process.argv[3] ?? 4000));
  if (process.env.CLEAR !== '0') clear();
  const out = count(m.platform.output[0]);
  const d = Object.keys(out).filter((k) => out[k] > (prev[k] ?? 0)).map((k) => k.replace('diamond_', ''));
  console.log('press', i, d.length, d.join(' '), 'leftover', JSON.stringify(count(m.platform.leftover[0])));
  prev = out;
}
