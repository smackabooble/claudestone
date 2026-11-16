// prints the schematic-relative coordinates of everything the user touches (for the design usage text)
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { loadFast } from './gear-fast.ts';
const w = new World();
const m = loadFast(w);
const e = exportSchem(w); const r = (p: number[]) => p.map((v, i) => v - e.origin[i]).join(',');
console.log('size', e.size.join('x'), 'blocks', w.listBlocks().length);
console.log('button', r(m.platform.button), '\ndiamonds', r(m.platform.diamonds[0]), '\nlogs', r(m.platform.logs[0]), '\noutput', r(m.platform.output[0]), '\nleftover', r(m.platform.leftover[0]));
console.log('lifts (base water cell)', m.lifts.map((l) => r(l.base)).join(' | '));
