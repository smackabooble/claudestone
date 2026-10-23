// diagnostic: does every pulse lane deliver pulses to its destination pin? usage: tsx examples/gear-set-lanes.ts [gt=8000]
import { World } from '../src/world.ts';
import { loadFast } from './gear-fast.ts';
const w = new World();
const m = loadFast(w);
w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 });
const times: Record<string, number[]> = {};
const gt = Number(process.argv[2] ?? 8000);
w.run(1500); w.use(m.platform.button);
const on: Record<string, boolean> = {};
for (let t = 0; t < gt; t += 2) {
  w.run(2);
  for (const { net, pin } of m.pins) { const p = ((w.get(pin) as any).p?.power ?? 0) > 0; if (p && !on[net]) (times[net] ??= []).push(t); on[net] = p; }
}
console.log('pulses seen at each lane destination pin (gt of each rising edge):');
for (const { net, pin } of m.pins) console.log(net.padEnd(30), pin.join(',').padEnd(14), (times[net] ?? []).length, (times[net] ?? []).slice(0, 12).join(' '));
