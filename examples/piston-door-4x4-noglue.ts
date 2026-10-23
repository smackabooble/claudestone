/**
 * 4x4 piston door WITHOUT slime or honey (sim only). Run: npx tsx examples/piston-door-4x4-noglue.ts
 *
 * Mechanism = abfielder's observer-chain "ring of nooks" 4x4 (knowledge/refs/compact-4x4-abfielder.litematic, user supplied),
 * recoloured with the wool convention: the 16 door blocks are WHITE wool (opaque, you cannot see through), other
 * pushable fillers light gray, furnaces (immovable) become obsidian.
 * Doorway x=3..6, y=3..6 in plane z=2 (walk through along z). Lever (5,1,0): ON = closed, OFF = open.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { loadSchematic } from '../src/schematic.ts';
import { exportSchem } from '../src/export.ts';
import type { Pos } from '../src/dirs.ts';

export const DOORWAY: Pos[] = [3, 4, 5, 6].flatMap((x) => [3, 4, 5, 6].map((y) => [x, y, 2] as Pos));
export const LEVER: Pos = [5, 1, 0];

export function buildDoor4NoGlue(w: World): { lever: Pos; doorway: Pos[] } {
  const s = loadSchematic(readFileSync(new URL('../knowledge/refs/compact-4x4-abfielder.litematic', import.meta.url)));
  const ring = new Set<string>();
  for (let i = 3; i <= 6; i++) { ring.add(`${i},7,2`); ring.add(`${i},2,2`); ring.add(`2,${i},2`); ring.add(`7,${i},2`); }
  for (const b of s.blocks) {
    let type = b.type;
    if (type === 'stone') type = ring.has(b.pos.join(',')) ? 'white_wool' : 'light_gray_wool';
    else if (type === 'furnace') type = 'obsidian';
    w.setRaw(b.pos, type, b.props);
  }
  return { lever: LEVER, doorway: DOORWAY };
}

if (process.argv[1]?.endsWith('piston-door-4x4-noglue.ts')) {
  const w = new World(); const { lever, doorway } = buildDoor4NoGlue(w); w.run(40);
  const solid = (p: Pos) => w.get(p).type === 'white_wool';
  const n = () => doorway.filter(solid).length;
  console.log('open at rest, wool in doorway:', n());
  for (let i = 0; i < 3; i++) { w.use(lever); w.run(150); const c = n(); w.use(lever); w.run(150); console.log(`cycle ${i}: closed ${c}/16, reopened ${n()}`); }
  const f = new World(); buildDoor4NoGlue(f); f.run(40);
  writeFileSync('examples/piston-door-4x4-noglue.schem', exportSchem(f).buffer);
  console.log('wrote examples/piston-door-4x4-noglue.schem');
}
