/**
 * Fingerprint of the simulator's behaviour on the gear set machine (loaded from the cache): hashes every block state and container content
 * every N ticks. Run before and after a simulator change; the output must be identical. usage: tsx examples/sim-fingerprint.ts [total gt=2500] [every=250]
 */
import { createHash } from 'node:crypto';
import { World } from '../src/world.ts';
import { loadGearSet } from './gear-set.ts';

const w = new World();
const m = loadGearSet(w);
w.setItem(m.blockChest[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.logChest, 0, { id: 'oak_log', count: 16 });
const total = Number(process.argv[2] ?? 2500), every = Number(process.argv[3] ?? 250);
const hash = () => {
  const h = createHash('sha1');
  const bl = w.listBlocks().sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1] || a.pos[2] - b.pos[2]);
  for (const b of bl) { h.update(JSON.stringify([b.pos, b.type, b.props])); const it = w.items(b.pos); if (it) h.update(JSON.stringify(it)); }
  return h.digest('hex').slice(0, 16);
};
const t0 = Date.now();
console.log('t=0', hash());
w.use(m.button);
for (let t = every; t <= total; t += every) { w.run(every); console.log('t=' + t, hash()); }
console.error('seconds', (Date.now() - t0) / 1000);
