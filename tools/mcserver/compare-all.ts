/** Run every design in the SIM vs REAL diff. Usage: npx tsx tools/mcserver/compare-all.ts  (server must be running: tools/mcserver/start.sh) */
import { compareDesign } from './compare.ts';
import { buildXnor } from '../../examples/xnor-gate.ts';
import { buildXor } from '../../examples/xor-gate.ts';
import { buildTriplePulse, buildQuadPulse } from '../../examples/triple-pulse.ts';
import { buildTrain } from '../../examples/piston-train.ts';

async function main() {
  let total = 0;
  const run = async (...a: Parameters<typeof compareDesign>) => { total += (await compareDesign(...a)).length; };
  await run('xnor idle', buildXnor, [{ wait: 40 }]);
  await run('xnor A on', buildXnor, [{ click: [10, 3, 2], stand: [12, 4, 3], waitTicks: 40 }]);
  await run('xnor A+B on', buildXnor, [{ click: [10, 3, 2], stand: [12, 4, 3], waitTicks: 40 }, { click: [10, 3, 4], stand: [12, 4, 3], waitTicks: 40 }]);
  await run('xor (comparators) A on', buildXor, [{ click: [-1, 1, 1], stand: [-3, 1, 1], waitTicks: 40 }]);
  await run('xor (comparators) A+B on', buildXor, [{ click: [-1, 1, 1], stand: [-3, 1, 1], waitTicks: 40 }, { click: [5, 1, 1], stand: [7, 1, 1], waitTicks: 40 }]);
  await run('triple pulse after button', buildTriplePulse, [{ click: [0, 1, 0], stand: [-2, 1, 0], waitTicks: 160 }]);
  await run('quad pulse after button', buildQuadPulse, [{ click: [0, 1, 0], stand: [-2, 1, 0], waitTicks: 220 }]);
  await run('piston train lever on', (w) => buildTrain(w, 12), [{ click: [12, 0, 2], stand: [14, 0, 2], waitTicks: 400 }]);
  console.log(total === 0 ? 'ALL IDENTICAL' : `${total} differences in total`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
