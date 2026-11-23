/** REAL-GAME check of a flying machine from examples/flyers.ts: exact paste (no updates), start with a block update on one redstone block, sprint N ticks, dump, report displacement.
 *  Run: FLYER=name TICKS=150 npx tsx tools/mcserver/test-flyer.ts */
import { World } from '../../src/world.ts';
import { FLYERS, buildFlyer } from '../../examples/flyers.ts';
import { rcon, pasteNoUpdates, cleanup } from './mc.ts';
import { dumpReal, runTicks } from './compare2.ts';
import { toBlockState } from '../../src/export.ts';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const name = process.env.FLYER || Object.keys(FLYERS)[0]; const TICKS = +(process.env.TICKS || 150);
const O: [number, number, number] = [0, 100, 0];
async function main() {
  await rcon('forceload add -64 -64 64 64'); await sleep(1500);
  await rcon('fill -60 90 -4 60 115 4 minecraft:air');
  const w = new World(); const info = buildFlyer(w, name);
  const cells = w.listBlocks().map((b) => ({ pos: [b.pos[0] + O[0], b.pos[1] + O[1], b.pos[2] + O[2]] as [number, number, number], state: toBlockState({ type: b.type, p: b.props }) }));
  console.log('pasted', await pasteNoUpdates(cells, [], 'flyer'));
  const minx = (m: Map<string, any>) => Math.min(...[...m.entries()].filter(([, c]) => !['piston_head', 'moving_piston', 'air'].includes(c.name)).map(([k]) => +k.split(',')[0]));
  const lo: [number, number, number] = [-60, 90, -4], hi: [number, number, number] = [60, 115, 4];
  const d0 = await dumpReal(lo, hi, 'fl0'); const x0 = minx(d0);
  // start: re-place the start block (block update on its neighbours)
  const s = info.start; const sp = `${s[0] + O[0]} ${s[1] + O[1]} ${s[2] + O[2]}`;
  await rcon(`setblock ${sp} minecraft:air`); await rcon(`setblock ${sp} minecraft:redstone_block`);
  for (const n of [TICKS / 3, TICKS / 3, TICKS / 3].map(Math.round)) { await runTicks(n); const d = await dumpReal(lo, hi, 'fl1'); console.log('x displacement', minx(d) - x0, 'blocks', [...d.values()].filter((c) => !['piston_head', 'moving_piston'].includes(c.name)).length); }
  console.log('sim says', info.simDisplacement(TICKS));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => cleanup([-60, 90, -4], [60, 115, 4], []));
