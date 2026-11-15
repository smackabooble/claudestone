/** the ORIGINAL abfielder compact 4x4 (knowledge/refs/compact-4x4-abfielder.litematic, not the recoloured copy) in the sim vs the real game */
import { readFileSync } from 'node:fs';
import { loadSchematic } from '../../src/schematic.ts';
import { compareDesign2 } from './compare2.ts';
const s = loadSchematic(readFileSync(new URL('../../knowledge/refs/compact-4x4-abfielder.litematic', import.meta.url)));
const r = await compareDesign2('abfielder-4x4-original', Number(process.env.TICKS ?? 400), {
  settle: 40, build: (w) => { for (const b of s.blocks) w.setRaw(b.pos, b.type, b.props); return { lever: [5, 1, 0] }; },
});
console.log(r.name, r.note); for (const d of r.diffs.slice(0, 15)) console.log('  ', d);
process.exit(0);
