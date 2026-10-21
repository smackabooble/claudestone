/**
 * Micro test 2 for the real game: quasi connectivity ("BUD").
 * Three copies (x = 0, 8, 16). Each has a piston facing EAST (a head would appear to its east) at the bottom, nothing in front.
 * Step 1: flip the copy's lever ON (copy A has no lever, the redstone block is already in place).
 * Step 2: NOW give the piston a block update: place any block against its WEST side and break it again.
 * Question: did the piston extend after step 2?   (Before step 2 it must NOT have extended anywhere.)
 *   copy A (x=0):  air above the piston, a redstone block on top of that air cell                         -> sim: extends
 *   copy B (x=8):  stone above the piston, another stone above that, lever on the side of the top stone  -> sim: extends
 *   copy C (x=16): same stones as B but only a REDSTONE BLOCK on top of the top stone (weak power)       -> sim: does NOT extend
 * Run: npx tsx examples/microtests/quasi.ts   (writes quasi.schem)
 */
import { writeFileSync } from 'node:fs';
import { World } from '../../src/world.ts';
import { exportSchem } from '../../src/export.ts';
import type { Pos } from '../../src/dirs.ts';

export function buildCopy(w: World, ox: number, kind: 'A' | 'B' | 'C'): { lever?: Pos; piston: Pos; update: Pos } {
  const P = (x: number, y: number, z: number): Pos => [ox + x, y, z];
  for (let x = -3; x <= 3; x++) for (let z = -1; z <= 1; z++) w.place(P(x, 1, z), 'obsidian');
  w.place(P(0, 2, 0), 'piston', { facing: 'east' });
  let lever: Pos | undefined;
  if (kind === 'A') {
    w.place(P(0, 4, 0), 'redstone_block');
  } else {
    w.place(P(0, 3, 0), 'stone'); w.place(P(0, 4, 0), 'stone');
    if (kind === 'B') { lever = P(-1, 4, 0); w.place(lever, 'lever', { face: 'wall', facing: 'west' }); }
    else w.place(P(0, 5, 0), 'redstone_block');
  }
  return { lever, piston: P(0, 2, 0), update: P(-1, 2, 0) };
}

if (process.argv[1]?.endsWith('quasi.ts')) {
  const fresh = new World();
  (['A', 'B', 'C'] as const).forEach((k, i) => buildCopy(fresh, i * 8, k));
  fresh.run(20);
  const out = exportSchem(fresh);
  writeFileSync('examples/microtests/quasi.schem', out.buffer);
  console.log('wrote quasi.schem', out.size.join('x'), 'origin', out.origin.join(','));
  const w = new World();
  const cs = (['A', 'B', 'C'] as const).map((k, i) => ({ k, ...buildCopy(w, i * 8, k) }));
  w.run(20);
  for (const c of cs) {
    if (c.lever) w.use(c.lever);
    w.run(10);
    const before = !!w.get(c.piston).p.extended;
    w.place(c.update, 'stone'); w.run(2); w.remove(c.update); w.run(10);
    console.log(`copy ${c.k}: extended before update ${before}, after update ${!!w.get(c.piston).p.extended}`);
  }
}
