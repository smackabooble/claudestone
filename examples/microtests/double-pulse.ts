/**
 * Micro test for the real game: what does a sticky piston do with TWO back-to-back observer pulses?
 * (The situation at piston (4,10,2) of lum3ndo's door, where my simulator and the real door disagree.)
 *
 * Three copies side by side (x = 0, 8, 16), each with its own lever. Flip a lever ON and watch the STONE under the piston.
 *   copy 0 (control): ONE pulse of 2 game ticks                       -> piston extends and retracts
 *   copy 1: pulse A, then pulse B right after it (no gap)             -> A and B are chained observers
 *   copy 2: pulse A, then pulse B with a 2 tick gap (extra observer)  -> B powers a stone above the stone above the piston (quasi connectivity)
 * Question per copy: where is the stone after 3 seconds?  LOW (it was pushed down and stayed) or HIGH (pulled back up)?
 * The simulator predicts: copy 0 LOW, copy 1 HIGH (!), copy 2 see output of this file.
 * Run: npx tsx examples/microtests/double-pulse.ts   (writes double-pulse.schem)
 */
import { writeFileSync } from 'node:fs';
import { World } from '../../src/world.ts';
import { exportSchem } from '../../src/export.ts';
import type { Pos } from '../../src/dirs.ts';

export function buildCopy(w: World, ox: number, kind: 0 | 1 | 2): { lever: Pos; stone: Pos } {
  const P = (x: number, y: number, z: number): Pos => [ox + x, y, z];
  for (let x = -4; x <= 1; x++) for (let z = -1; z <= 1; z++) w.place(P(x, 1, z), 'obsidian'); // floor
  w.place(P(0, 4, 0), 'sticky_piston', { facing: 'down' });
  w.place(P(0, 3, 0), 'stone');                     // the stone to watch (pushed down to y=2 when the piston extends)
  w.place(P(0, 5, 0), 'stone');                     // C: powers the piston from above
  // pulse A: observer east of X dust, its back (east) is the piston
  w.place(P(-2, 2, 0), 'obsidian'); w.place(P(-2, 3, 0), 'obsidian');
  w.place(P(-2, 4, 0), 'redstone_wire');            // X
  w.place(P(-1, 4, 0), 'observer', { facing: 'west' });
  w.place(P(-3, 3, 0), 'lever', { face: 'wall', facing: 'west' }); // attached to (-2,3,0)
  if (kind >= 1) {
    w.place(P(-2, 5, 0), 'observer', { facing: 'down' });   // Z watches X, fires together with A
    if (kind === 1) {
      w.place(P(-1, 5, 0), 'observer', { facing: 'west' }); // B watches Z, back (east) = C -> powers the piston from above
    } else {
      w.place(P(-2, 6, 0), 'observer', { facing: 'down' }); // Z2 watches Z (2 ticks later)
      w.place(P(-1, 6, 0), 'observer', { facing: 'west' }); // B watches Z2, back = (0,6,0)
      w.place(P(0, 6, 0), 'stone');                          // powered stone above C: quasi-connects to the piston
    }
  }
  return { lever: P(-3, 3, 0), stone: P(0, 3, 0) };
}

export function buildAll(w: World) {
  return [0, 1, 2].map((k) => buildCopy(w, k * 8, k as 0 | 1 | 2));
}

if (process.argv[1]?.endsWith('double-pulse.ts')) {
  const fresh = new World();
  buildAll(fresh);
  fresh.run(20);
  const out = exportSchem(fresh); // exported BEFORE the trials: levers off, stones up
  writeFileSync('examples/microtests/double-pulse.schem', out.buffer);
  console.log('wrote double-pulse.schem', out.size.join('x'), 'origin', out.origin.join(','));
  const w = new World();
  const copies = buildAll(w);
  w.run(20);
  for (const [i, c] of copies.entries()) {
    w.use(c.lever);
    const track: string[] = [];
    for (let t = 0; t < 40; t++) { w.step(); const y = [3, 2].find((y) => w.get([c.stone[0], y, 0]).type === 'stone'); const s = `${y ?? '?'}`; if (track[track.length - 1] !== s) track.push(s); }
    w.run(40);
    const y = [3, 2].find((yy) => w.get([c.stone[0], yy, 0]).type === 'stone');
    console.log(`copy ${i}: stone y over time ${track.join('->')}  final ${y === 2 ? 'LOW (pushed down, stayed)' : y === 3 ? 'HIGH (pulled back up)' : '?'}`);
  }
}
