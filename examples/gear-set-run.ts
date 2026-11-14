/**
 * Slow end-to-end run of the diamond gear set machine (sim only, ~4 min per press).
 * usage: npx tsx examples/gear-set-run.ts [presses=4] [gt per press=5000]
 * Press 1 primes the hoppers and makes 6 of the 8 items; every later press makes the full set (4 blocks + 1 log each).
 */
import { World } from '../src/world.ts';
import { loadGearSet } from './gear-set.ts';
import { runWithLifts } from './gear-lift.ts';

const w = new World();
const m = loadGearSet(w);
w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 });
runWithLifts(w, m.lifts, 1500);                                // the input chests drain down to the hub first
const count = (p: any) => { const t: Record<string, number> = {}; for (const x of (w.items(p) ?? []) as any[]) if (x) t[x.id] = (t[x.id] ?? 0) + x.count; return t; };
const presses = Number(process.argv[2] ?? 4), gt = Number(process.argv[3] ?? 5000);
let prev: Record<string, number> = {};
for (let press = 1; press <= presses; press++) {
  w.use(m.platform.button);
  runWithLifts(w, m.lifts, gt);
  const out = count(m.platform.output[0]);
  const delta = Object.fromEntries(Object.keys(out).map((k) => [k, out[k] - (prev[k] ?? 0)]));
  console.log(`press ${press}: +${JSON.stringify(delta)}  blocks left ${count(m.blockChest[0]).diamond_block ?? 0}, logs left ${count(m.logChest).oak_log ?? 0}, leftover ${JSON.stringify(count(m.platform.leftover[0]))}`);
  prev = out;
}
