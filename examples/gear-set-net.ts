// diagnostic: peak power of every cell of one lane net. usage: tsx examples/gear-set-net.ts <net> <from gt> <to gt>
import { World } from '../src/world.ts';
import { loadGearSet } from './gear-set.ts';
const w = new World();
const m = loadGearSet(w);
const net = process.argv[2]; const t0 = Number(process.argv[3] ?? 0), t1 = Number(process.argv[4] ?? 600);
const occ = (m.b as any).occ as Map<string, any>;
const cells: number[][] = [];
for (const [k, t] of occ.entries()) if (t.net === net) cells.push(k.split(',').map(Number));
const peak: Record<string, number> = {};
w.setItem(m.blockChest[0], 0, { id: 'diamond_block', count: 64 }); w.setItem(m.logChest, 0, { id: 'oak_log', count: 16 });
w.use(m.button);
for (let t = 0; t < t1; t++) { w.run(1); if (t >= t0) for (const c of cells) { const b: any = w.get(c as any); const v = b?.p?.power ?? (b?.p?.powered ? 15 : 0); const k = c.join(','); peak[k] = Math.max(peak[k] ?? 0, v); } }
const pin = m.pins.find((p) => p.net === net)?.pin;
console.log(net, 'cells', cells.length, 'pin', pin?.join(','));
console.log(cells.map((c) => { const b: any = w.get(c as any); return `${c.join(',')}${b.type === 'repeater' ? 'R' : ''}=${peak[c.join(',')]}`; }).join('  '));
