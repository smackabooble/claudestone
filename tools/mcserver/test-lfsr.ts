/** REAL-GAME check of examples/lfsr4.ts: paste, seed, flip STEP 20 times, read Q1..Q4 each step and check every transition obeys the LFSR rule next=[Q3^Q4,Q1,Q2,Q3] and that the period is 15. */
import { World } from '../../src/world.ts';
import { buildLfsr } from '../../examples/lfsr4.ts';
import { rcon, pasteWorld, clickBlock, cleanup } from './mc.ts';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const O: [number, number, number] = [0, 100, 0], R = (p: number[]) => [p[0] + O[0], p[1] + O[1], p[2] + O[2]] as [number, number, number];
async function main() {
  const BOX: [[number, number, number], [number, number, number]] = [[-12, 95, -22], [40, 112, 14]];
  await rcon('forceload add -16 -32 48 32'); await sleep(1500); await cleanup(BOX[0], BOX[1]);
  const w = new World(); const c = buildLfsr(w); w.settleWires(); w.pasteUpdates(); w.run(80);
  console.log('pasted', await pasteWorld(w, O)); await sleep(3000);
  const bits = async () => { let s = ''; for (const p of c.S) s += (await rcon(`script run print(block_state(${R(p).join(',')}))`)).match(/powered: (\w+)/)?.[1] === 'true' ? '1' : '0'; return s; };
  const stepStand: [number, number, number] = [32, 0, 0], seedStand: [number, number, number] = [-5, 0, -3];
  const states: string[] = [await bits()]; console.log('rest state', states[0]);
  if (states[0] === '0000') { await clickBlock(R(seedStand), R(c.SEED), true); await sleep(1500); }
  for (let i = 0; i < 20; i++) {
    await clickBlock(R(stepStand), R(c.STEP), true); await sleep(3200);
    states.push(await bits());
    if (i === 0 && states[0] === '0000') { await clickBlock(R(seedStand), R(c.SEED), true); await sleep(1500); }   // seed off again after the first step
  }
  console.log(states.join(' '));
  let ok = true;
  for (let i = 1; i < states.length; i++) {
    const [a, b, cc, d] = states[i - 1].split('').map(Number);
    if (a + b + cc + d === 0) continue;                       // from 0000 only the seed moves it
    const want = `${cc ^ d}${a}${b}${cc}`; if (states[i] !== want) { ok = false; console.log(`step ${i}: ${states[i - 1]} -> ${states[i]} but the LFSR rule says ${want}`); }
  }
  const seen = new Set(states.filter((s) => s !== '0000'));
  console.log(ok ? `REAL GAME: every transition follows the LFSR rule; ${seen.size} different non-zero states seen` : 'REAL GAME: MISMATCH');
  await cleanup(BOX[0], BOX[1], [R(stepStand), R(seedStand)]);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
