// platform check: items put into the platform chests must reach the hub chests, and the platform button must start a press.
import { World } from '../src/world.ts';
import { loadGearSet } from './gear-set.ts';
const w = new World();
const m = loadGearSet(w);
const count = (p: any) => { const t: Record<string, number> = {}; for (const x of (w.items(p) ?? []) as any[]) if (x) t[x.id] = (t[x.id] ?? 0) + x.count; return t; };
w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 });
w.run(600);
console.log('platform diamonds', count(m.platform.diamonds[0]), 'hub block chest', count(m.blockChest[0]));
console.log('platform logs', count(m.platform.logs[0]), 'hub log chest', count(m.logChest));
w.use(m.platform.button); w.run(9000);
console.log('output', JSON.stringify(count(m.outputs[0])), 'leftover', JSON.stringify(count(m.leftover[0])));
