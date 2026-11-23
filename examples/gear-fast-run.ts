/**
 * End-to-end run of the compact gear set (sim only). usage: tsx examples/gear-fast-run.ts [presses=3] [gt per press=3000]
 * Prints the items that reached the platform OUTPUT chest per press and when the 8th item arrived (gt after the button press).
 */
import { World } from '../src/world.ts';
import { loadFast } from './gear-fast.ts';
import { runWithLifts } from './gear-lift.ts';

const w = new World();
const m = loadFast(w);
w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 });
runWithLifts(w, m.lifts, 1500);
const count = (p: any) => { const t: Record<string, number> = {}; for (const x of (w.items(p) ?? []) as any[]) if (x) t[x.id] = (t[x.id] ?? 0) + x.count; return t; };
const presses = Number(process.argv[2] ?? 3), gt = Number(process.argv[3] ?? 3000);
let prev: Record<string, number> = {};
for (let press = 1; press <= presses; press++) {
  w.use(m.platform.button);
  let done = -1, lastItem = 0;
  for (let t = 0; t < gt; t += 8) {
    runWithLifts(w, m.lifts, 8);
    const n = Object.values(count(m.platform.output[0])).reduce((a, v) => a + v, 0) - Object.values(prev).reduce((a, v) => a + v, 0);
    if (n > lastItem) { lastItem = n; done = t + 8; }
  }
  const out = count(m.platform.output[0]);
  const delta = Object.fromEntries(Object.keys(out).map((k) => [k, out[k] - (prev[k] ?? 0)]));
  console.log(`press ${press}: ${lastItem} items, last at ${done} gt (${(done / 20).toFixed(0)} s) +${JSON.stringify(delta)} leftover ${JSON.stringify(count(m.platform.leftover[0]))}`);
  prev = out;
}
