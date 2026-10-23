// find where a given item ends up after N presses. usage: tsx gear-fast-find.ts <item-regex> [presses=1] [gt=3500]
import { World } from '../src/world.ts';
import { loadFast } from './gear-fast.ts';
import { runWithLifts } from './gear-lift.ts';
const w = new World();
const m = loadFast(w);
w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 });
runWithLifts(w, m.lifts, 1500);
const re = new RegExp(process.argv[2] ?? 'planks');
for (let i = 0; i < Number(process.argv[3] ?? 1); i++) { w.use(m.platform.button); runWithLifts(w, m.lifts, Number(process.argv[4] ?? 3500)); }
for (const b of w.listBlocks() as any[]) {
  if (!['hopper', 'dropper', 'crafter', 'chest'].includes(b.type)) continue;
  const it = ((w.items(b.pos) ?? []) as any[]).filter((x) => x && re.test(x.id));
  if (it.length) console.log(b.type, b.pos.join(','), it.map((x) => x.id + 'x' + x.count).join(' '));
}
