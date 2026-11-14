/** REAL-GAME check of examples/xnor-gate.ts: paste into the real server, flip both levers through all 4 combinations, read the lamp. Run: npx tsx tools/mcserver/test-xnor.ts */
import { World } from '../../src/world.ts';
import { buildXnor } from '../../examples/xnor-gate.ts';
import { rcon, pasteWorld, blockIs, clickBlock } from './mc.ts';
import { toBlockState } from '../../src/export.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const O: [number, number, number] = [0, 100, 0];
const sh = (p: number[]): [number, number, number] => [p[0] + O[0], p[1] + O[1], p[2] + O[2]];
async function main() {
  await rcon('forceload add -32 -32 32 32'); await sleep(1500);
  await rcon('fill -8 98 -8 24 110 12 minecraft:air');
  const w = new World(); const g = buildXnor(w); w.run(40);
  console.log('pasted blocks:', await pasteWorld(w, O));
  const STAND: [number, number, number] = [12, 102, 3];
  const lever = async (p: number[], on: boolean) => {
    const b = w.get(p as any); const want = toBlockState({ type: b.type, p: { ...b.p, powered: on } });
    if (await blockIs(sh(p), want)) return;                       // already in the wanted state
    await clickBlock(STAND, sh(p)); await sleep(300);
  };
  const lamp = sh(g.lamp);
  let ok = true;
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 0]]) {
    await lever(g.a, !!a); await lever(g.b, !!b); await sleep(2500);
    const lit = await blockIs(lamp, 'minecraft:redstone_lamp[lit=true]');
    const good = lit === (a === b); ok &&= good;
    console.log(`A=${a} B=${b} -> lamp ${lit ? 'LIT' : 'dark'}  expected ${a === b ? 'LIT' : 'dark'}  ${good ? 'ok' : 'MISMATCH'}`);
  }
  console.log(ok ? 'REAL GAME: XNOR truth table correct' : 'REAL GAME: MISMATCH');
}
main().catch((e) => { console.error(e); process.exit(1); });
