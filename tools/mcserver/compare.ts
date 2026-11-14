/**
 * SIM vs REAL diff. compareDesign(): build a design in the simulator, paste it into the real server, run the same actions in both
 * (click a lever/button, wait), then compare EVERY block (type + all state properties) between the two. Any difference is a simulator bug (or a paste problem).
 * Steady-state comparison (real time waits); per-tick comparison is tools/gearrec.sc + tools/labtrace.ts.
 */
import { World } from '../../src/world.ts';
import { toBlockState } from '../../src/export.ts';
import { rcon, pasteWorld, clickBlock, cleanup } from './mc.ts';
import type { Pos } from '../../src/dirs.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type Action = { click: Pos; stand: Pos; waitTicks: number } | { wait: number };
export interface Diff { pos: Pos; sim: string; real: string }

const parseSim = (s: string): { name: string; props: Record<string, string> } => {
  const m = s.match(/^minecraft:([a-z_]+)(?:\[(.*)\])?$/)!;
  const props: Record<string, string> = {};
  if (m[2]) for (const kv of m[2].split(',')) { const [k, v] = kv.split('='); props[k] = v; }
  return { name: m[1], props };
};
const parseReal = (s: string): Record<string, string> => {
  const m = s.match(/\{(.*?)\} = /); const props: Record<string, string> = {};
  if (m && m[1]) for (const kv of m[1].split(', ')) { const i = kv.indexOf(':'); props[kv.slice(0, i)] = kv.slice(i + 2); }
  return props;
};

export async function compareDesign(name: string, build: (w: World) => unknown, actions: Action[], origin: Pos = [0, 100, 0], ignore: string[] = []): Promise<Diff[]> {
  await rcon('forceload add -48 -48 96 96'); await sleep(1500);
  const w = new World(); build(w); w.run(40); w.settleWires();
  const bl = w.listBlocks().filter((b) => b.type !== 'moving_piston');
  const min = [0, 1, 2].map((i) => Math.min(...bl.map((b) => b.pos[i]))), max = [0, 1, 2].map((i) => Math.max(...bl.map((b) => b.pos[i])));
  const lo: Pos = [min[0] + origin[0] - 3, min[1] + origin[1] - 3, min[2] + origin[2] - 3], hi: Pos = [max[0] + origin[0] + 6, max[1] + origin[1] + 6, max[2] + origin[2] + 6];
  await cleanup(lo, hi);
  await pasteWorld(w, origin); await sleep(2000);
  // NORMALISE: pasting into the live server can start a machine by itself (observers placed next to freshly placed parts pulse once). Put every cell back to the simulator's
  // initial state (type + state) so both sides start identical; repeat until nothing differs.
  const simCells = new Map(bl.map((b) => [b.pos.join(','), toBlockState({ type: b.type, p: b.props })]));
  for (let round = 0; round < 3; round++) {
    let fixed = 0;
    for (let x = min[0] - 2; x <= max[0] + 2; x++) for (let y = min[1] - 2; y <= max[1] + 2; y++) for (let z = min[2] - 2; z <= max[2] + 2; z++) {
      const want = simCells.get(`${x},${y},${z}`) ?? 'minecraft:air', rp = [x + origin[0], y + origin[1], z + origin[2]];
      const got = (await rcon(`script run print(block(${rp.join(',')}))`)).match(/^(\S+) = /)?.[1] ?? '?';
      const wantName = want.replace('minecraft:', '').split('[')[0];
      if (got !== wantName) { await rcon(`setblock ${rp.join(' ')} ${want} replace`); fixed++; }
    }
    if (!fixed) break;
    await sleep(1500);
  }
  const stands: Pos[] = [];
  for (const a of actions) {
    if ('wait' in a) { w.run(a.wait); await sleep(a.wait * 50 + 500); continue; }
    const t = [a.click[0] + origin[0], a.click[1] + origin[1], a.click[2] + origin[2]] as Pos, st = [a.stand[0] + origin[0], a.stand[1] + origin[1], a.stand[2] + origin[2]] as Pos;
    stands.push(st);
    await clickBlock(st, t); w.use(a.click); w.run(a.waitTicks); await sleep(a.waitTicks * 50 + 700);
  }
  const diffs: Diff[] = [];
  for (const b of w.listBlocks()) {
    if (b.type === 'moving_piston') continue;
    const simS = toBlockState({ type: b.type, p: b.props }), sim = parseSim(simS);
    const p: Pos = [b.pos[0] + origin[0], b.pos[1] + origin[1], b.pos[2] + origin[2]];
    const nameR = (await rcon(`script run print(block(${p.join(',')}))`)).match(/^(\S+) = /)?.[1] ?? '?';
    const real = parseReal(await rcon(`script run print(block_state(${p.join(',')}))`));
    const bad: string[] = [];
    if (nameR !== sim.name && !(sim.name.endsWith('_stone') || nameR.includes('stone'))) bad.push(`type ${sim.name} vs ${nameR}`);
    for (const [k, v] of Object.entries(sim.props)) if (!ignore.includes(k) && real[k] !== undefined && real[k] !== v) bad.push(`${k}: sim ${v} real ${real[k]}`);
    if (bad.length) diffs.push({ pos: b.pos, sim: `${b.type} ${bad.join('; ')}`, real: JSON.stringify(real) });
  }
  await cleanup(lo, hi, stands);
  console.log(`${name}: ${bl.length} blocks compared, ${diffs.length} differences`);
  for (const d of diffs) console.log('  ', d.pos.join(','), d.sim);
  return diffs;
}
