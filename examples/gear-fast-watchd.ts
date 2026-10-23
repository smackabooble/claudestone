// watch the diamond counts in the D stash and its ports during the second press
import { World } from '../src/world.ts';
import { loadFast } from './gear-fast.ts';
import { runWithLifts } from './gear-lift.ts';
const w = new World();
const m = loadFast(w);
w.setItem(m.platform.diamonds[0], 0, { id: 'diamond_block', count: 64 });
w.setItem(m.platform.logs[0], 0, { id: 'oak_log', count: 16 });
runWithLifts(w, m.lifts, 1500);
const clear = () => { for (const b of w.listBlocks() as any[]) if (b.type === 'crafter') for (let i = 0; i < 9; i++) w.setItem(b.pos, i, null); };
w.use(m.platform.button); runWithLifts(w, m.lifts, 4000); clear();
const O = JSON.parse(process.argv[2]) as number[];   // feed pair origin
const cells: Record<string, number[]> = { chestL: [0, 1, 0], tapY: [0, 0, 0], dropY: [-1, 0, 0], outY: [-2, 0, 0], tapX: [1, 0, 0], dropX: [2, 0, 0], outX: [3, 0, 0] };
const tot = (p: any) => ((w.items(p) ?? []) as any[]).reduce((a, x) => a + (x ? x.count : 0), 0);
const show = () => Object.entries(cells).map(([k, d]) => `${k}:${tot([O[0] + d[0], O[1] + d[1], O[2] + d[2]])}`).join(' ');
w.use(m.platform.button);
let last = '';
for (let t = 0; t < 1400; t += 2) { runWithLifts(w, m.lifts, 2); const s = show(); if (s !== last) { console.log(t, s); last = s; } }
