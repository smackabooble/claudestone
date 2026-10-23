import { World } from '../src/world.ts';
import { buildGearSet } from './gear-set.ts';

const w = new World();
const m = buildGearSet(w);
w.setItem(m.blockChest[0], 0, { id: 'diamond_block', count: 16 });
w.setItem(m.logChest, 0, { id: 'oak_log', count: 8 });
const tally = () => {
  const t: Record<string, number> = {};
  for (let s = 0; s < 27; s++) { const it = w.items(m.outputs[0])?.[s]; if (it) t[it.id] = (t[it.id] ?? 0) + it.count; }
  return t;
};
for (let press = 1; press <= Number(process.argv[2] ?? 3); press++) {
  w.use(m.button);
  w.run(Number(process.argv[3] ?? 1800));
  console.log('press', press, JSON.stringify(tally()));
}
