// diagnostic: follow the items through the output lift (chest -> hopper -> dropper -> drops -> exit hopper -> platform chest)
import { World } from '../src/world.ts';
import { loadGearSet } from './gear-set.ts';
import { runWithLifts } from './gear-lift.ts';
const w = new World();
const m = loadGearSet(w);
w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 });
const tot = (p: any) => ((w.items(p) ?? []) as any[]).reduce((a, x) => a + (x ? x.count : 0), 0);
w.use(m.platform.button);
for (let k = 0; k < 4; k++) {
  runWithLifts(w, m.lifts, 2500);
  const l = m.lifts[0];
  console.log('t', (k + 1) * 2500, 'ground out chest', tot(m.outputs[0]), 'dropper', tot(l.dropper), 'clock h1/h2', tot(l.clock[0]), tot(l.clock[1]), 'drops', w.drops.length, 'exit', tot(l.exit), 'platform out', tot(m.platform.output[0]));
  const l2 = m.lifts[1];
  console.log('   leftover: ground', tot(m.leftover[0]), 'dropper', tot(l2.dropper), 'clock', tot(l2.clock[0]), tot(l2.clock[1]), 'exit', tot(l2.exit), 'platform', tot(m.platform.leftover[0]));
}
console.log(JSON.stringify(m.lifts));
for (const b of w.listBlocks() as any[]) {
  if (!['hopper', 'dropper', 'chest'].includes(b.type)) continue;
  const it = ((w.items(b.pos) ?? []) as any[]).filter((x) => x && /boots|helmet|sword|pickaxe|axe|shovel|legg|chest(plate)?/.test(x.id) && x.id !== 'chest');
  if (it.length) console.log(b.type, b.pos.join(','), JSON.stringify(it.map((x) => x.id + 'x' + x.count)));
}
