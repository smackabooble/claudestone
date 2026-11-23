/** REAL-GAME check of examples/lamp-screen.ts: paste, switch pixels by swapping the z=4 input block (cyan wool <-> redstone block, same signal as the lever), read all lamps. */
import { World } from '../../src/world.ts';
import { buildScreen } from '../../examples/lamp-screen.ts';
import { rcon, pasteWorld, cleanup } from './mc.ts';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const W = 4, H = 4, O: [number, number, number] = [0, 100, 0];
async function main() {
  await rcon('forceload add -32 -32 32 32'); await sleep(1500);
  await rcon('fill -4 96 -4 20 112 12 minecraft:air');
  const w = new World(); const s = buildScreen(w, W, H); w.settleWires(); w.pasteUpdates(); w.run(60);
  await pasteWorld(w, O); await sleep(1500);
  let seed = 11; const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let bad = 0;
  for (const name of ['allOn', 'allOff', 'checker', 'rnd0', 'rnd1']) {
    const pat = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => name === 'allOn' ? true : name === 'allOff' ? false : name === 'checker' ? (x + y) % 2 === 0 : r() < 0.5));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let dx = 0; dx < 2; dx++)
      await rcon(`setblock ${2 * x + dx + O[0]} ${2 * y + O[1]} ${4 + O[2]} minecraft:${pat[y][x] ? 'redstone_block' : 'cyan_wool'}`);
    await sleep(2500);
    let got = '', want = '';
    for (let ly = 0; ly < 2 * H; ly++) for (let lx = 0; lx < 2 * W; lx++) {
      const lit = (await rcon(`execute if block ${lx + O[0]} ${ly + O[1]} ${O[2]} minecraft:redstone_lamp[lit=true]`)).includes('passed');
      got += lit ? '1' : '0'; want += pat[Math.floor(ly / 2)][Math.floor(lx / 2)] ? '0' : '1';
    }
    const ok = got === want; if (!ok) bad++; console.log(name.padEnd(8), ok ? 'OK' : 'MISMATCH\n' + got + '\n' + want);
  }
  console.log(bad ? 'REAL GAME: MISMATCH' : 'REAL GAME: all patterns correct');
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => cleanup([-4, 96, -4], [20, 112, 12], []));
