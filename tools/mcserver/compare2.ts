/**
 * SIM vs REAL for the registered designs (src/designs.ts): build in the simulator, paste into the real server, put every cell back to the sim's start state, flip the design's
 * lever with the fake player (ON, then OFF), run exactly N game ticks in BOTH (`tick sprint`), dump all blocks of the real world to a file (tools/mcserver/dump.sc) and diff.
 * Usage: npx tsx tools/mcserver/compare2.ts [design-name ...]     (server running: tools/mcserver/start.sh)
 */
import { readFileSync } from 'node:fs';
import { World } from '../../src/world.ts';
import { toBlockState } from '../../src/export.ts';
import { DESIGNS } from '../../src/designs.ts';
import { rcon, pasteWorld, clickBlock, cleanup } from './mc.ts';
import type { Pos } from '../../src/dirs.ts';

const DUMP_DIR = '/home/user/mcserver/world/scripts/dump.data';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Cell = { name: string; props: Record<string, string> };

export const parseState = (s: string): Cell => {
  const m = s.match(/^minecraft:([a-z_0-9]+)(?:\[(.*)\])?$/)!; const props: Record<string, string> = {};
  if (m[2]) for (const kv of m[2].split(',')) { const [k, v] = kv.split('='); props[k] = v; }
  return { name: m[1], props };
};
export const lastItems = new Map<string, { slot: number; id: string; count: number }[]>();   // container contents of the last dumpReal (key x,y,z)
let dumpLoaded = false;
export async function dumpReal(lo: Pos, hi: Pos, tag: string): Promise<Map<string, Cell>> {
  if (!dumpLoaded) { await rcon('script unload dump').catch(() => ''); await rcon('script load dump'); dumpLoaded = true; }   // always run the current tools/mcserver/dump.sc
  await rcon(`dump ${lo.join(' ')} ${hi.join(' ')} ${tag}`);
  const out = new Map<string, Cell>(); lastItems.clear();
  for (const line of readFileSync(`${DUMP_DIR}/${tag}.txt`, 'utf8').split('\n')) {
    const v = line.match(/^V (-?\d+) (-?\d+) (-?\d+) (\d+) (\S+) (\d+)$/);
    if (v) { const k = `${v[1]},${v[2]},${v[3]}`; const a = lastItems.get(k) ?? []; a.push({ slot: Number(v[4]), id: v[5].replace(/^minecraft:/, ''), count: Number(v[6]) }); lastItems.set(k, a); continue; }
    const m = line.match(/^(-?\d+) (-?\d+) (-?\d+) (\S+) \{(.*)\}$/); if (!m) continue;
    const props: Record<string, string> = {};
    if (m[5]) for (const kv of m[5].split(', ')) { const i = kv.indexOf(':'); props[kv.slice(0, i)] = kv.slice(i + 2); }
    out.set(`${m[1]},${m[2]},${m[3]}`, { name: m[4], props });
  }
  return out;
}
export async function runTicks(n: number): Promise<void> {
  await rcon(`tick sprint ${n}`);
  for (let i = 0; i < 600; i++) { await sleep(100); if (!(await rcon('tick query')).includes('sprint')) return; }
}
/** a free cell for the bot 2-3 blocks from the lever, one level below it, with air above and a clear line */
export function findStand(w: World, lever: Pos): Pos | null {
  const air = (p: Pos) => w.get(p).type === 'air';
  const lb = w.get(lever), F: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
  const open = lb.p.face === 'wall' ? F[lb.p.facing] : undefined;    // a wall lever can only be clicked from its open side
  for (const d of [2, 3, 4]) for (const dy of [-1, -2, -3, 0]) for (const [dx, dz] of (open ? [[open[0] * d, open[1] * d]] : [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]]) as [number, number][]) {
    const s: Pos = [lever[0] + dx, lever[1] + dy, lever[2] + dz];
    if (!air(s) || !air([s[0], s[1] + 1, s[2]]) || !air([s[0], s[1] + 2, s[2]]) || !air([s[0], s[1] - 1, s[2]])) continue;
    // clear straight line from the bot's eye to the lever (sampled), so the click ray cannot hit something else first
    let clear = true; const eye = [s[0] + 0.5, s[1] + 1.62, s[2] + 0.5], tgt = [lever[0] + 0.5 - (open ? 0.3 * open[0] : 0), lever[1] + (open ? 0.5 : 0.2), lever[2] + 0.5 - (open ? 0.3 * open[1] : 0)];
    for (let t = 0.05; t < 0.8; t += 0.05) { const q: Pos = [Math.floor(eye[0] + (tgt[0] - eye[0]) * t), Math.floor(eye[1] + (tgt[1] - eye[1]) * t), Math.floor(eye[2] + (tgt[2] - eye[2]) * t)]; if (!air(q)) clear = false; }
    if (clear) return s;
  }
  return null;
}

export async function compareDesign2(name: string, ticks = Number(process.env.TICKS ?? 300), custom?: { build: (w: World) => { lever: Pos }; settle: number }): Promise<{ name: string; diffs: string[]; note: string }> {
  const d = custom ?? DESIGNS.find((x) => x.name === name)!;
  const w = new World(); const { lever } = d.build(w); w.run(d.settle); w.settleWires();
  const bl = w.listBlocks().filter((b) => b.type !== 'moving_piston');
  const mn = [0, 1, 2].map((i) => Math.min(...bl.map((b) => b.pos[i]))), mx = [0, 1, 2].map((i) => Math.max(...bl.map((b) => b.pos[i])));
  const shift: Pos = [16 - mn[0], 100 - mn[1], 16 - mn[2]];
  const R = (p: Pos): Pos => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
  const lo = R([mn[0] - 6, mn[1] - 6, mn[2] - 6]), hi = R([mx[0] + 6, mx[1] + 6, mx[2] + 6]);
  const stand = findStand(w, lever);   // clickBlock puts the bot one level below the lever; only x/z (and the platform) of this cell matter
  if (!stand) return { name, diffs: [], note: 'SKIPPED: no free standing cell near the lever' };
  await rcon('tick rate 20'); await rcon(`forceload add ${lo[0]} ${lo[2]} ${hi[0]} ${hi[2]}`); await sleep(2500);
  await cleanup(lo, hi);
  // the sim world is pasted at `shift`: pasteWorld adds the origin, so pass the shift
  await pasteWorld(w, shift); await sleep(2000);
  const expect = new Map(bl.map((b) => [R(b.pos).join(','), parseState(toBlockState({ type: b.type, p: b.props }))] as const));
  // normalise: put every differing cell back to the sim's start state (pasting can start observer machines by itself)
  for (let round = 0; round < 4; round++) {
    const real = await dumpReal(lo, hi, 'norm'); let fixed = 0;
    for (const [k, e] of expect) { const r = real.get(k); if (!r || r.name !== e.name || Object.entries(e.props).some(([a, v]) => r.props[a] !== undefined && r.props[a] !== v && ['facing', 'extended', 'type'].includes(a))) fixed++; }
    for (const [k, r] of real) if (!expect.has(k)) { await rcon(`setblock ${k.split(',').join(' ')} minecraft:air`); fixed++; void r; }
    for (const b of bl) { const k = R(b.pos).join(','), r = real.get(k), e = expect.get(k)!; if (!r || r.name !== e.name) await rcon(`setblock ${k.split(',').join(' ')} ${toBlockState({ type: b.type, p: b.props })} replace`); }
    if (!fixed) break; await sleep(1200);
  }
  const diffs: string[] = [];
  const check = async (label: string) => {
    const real = await dumpReal(lo, hi, 'cmp'); let n = 0;
    const cur = new Map(w.listBlocks().filter((b) => b.type !== 'moving_piston').map((b) => [R(b.pos).join(','), parseState(toBlockState({ type: b.type, p: b.props }))] as const));
    for (const [k, e] of cur) {
      const r = real.get(k), bad: string[] = [];
      if (!r) bad.push(`real has nothing (sim ${e.name})`);
      else { if (r.name !== e.name && !(e.name === 'stone' || r.name.includes('stone'))) bad.push(`type sim ${e.name} real ${r.name}`); for (const [a, v] of Object.entries(e.props)) if (r.props[a] !== undefined && r.props[a] !== v && !(a === 'distance' && e.name.endsWith('leaves')) && !(a === 'instrument' && e.name === 'note_block')) bad.push(`${a}: sim ${v} real ${r.props[a]}`); }
      if (bad.length) { n++; if (diffs.length < 400) diffs.push(`[${label}] ${k} ${e.name}: ${bad.join('; ')}`); }
    }
    const plat = [R(stand)[0], R(stand)[1] - 1, R(stand)[2]].join(',');   // the bot's own standing platform
    for (const [k, r] of real) if (!cur.has(k) && k !== plat && n < 400) { n++; if (diffs.length < 40) diffs.push(`[${label}] ${k} real has extra ${r.name}`); }
    return n;
  };
  const total: number[] = [];
  for (const [label, on] of [['ON', true], ['OFF', false]] as const) {
    void on;
    await clickBlock(R(stand), R(lever), true); w.use(lever);
    await runTicks(ticks); w.run(ticks);
    total.push(await check(label));
  }
  await cleanup(lo, hi, [R(stand)]);   // (also removes the platform one below the stand cell)
  return { name, diffs, note: `${bl.length} blocks, differences after ON ${total[0]}, after OFF ${total[1]}` };
}

async function main() {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : DESIGNS.map((d) => d.name);
  for (const n of names) {
    const t0 = Date.now();
    try { const r = await compareDesign2(n); console.log(`${r.name}: ${r.note} (${((Date.now() - t0) / 1000).toFixed(0)} s)`); if (process.env.ALL) for (const x of r.diffs) console.log('   ', x); const ls = r.diffs.filter((x) => x.includes(' lever:')); for (const x of ls) console.log('   ', x); const by = new Map<string, number>(); for (const x of r.diffs) { const m = x.match(/^\[(\w+)\] \S+ (\S+): (.*)$/); const key = m ? `[${m[1]}] ${m[2]}: ${m[3].replace(/\d+/g, '#').slice(0, 70)}` : x.slice(0, 90); by.set(key, (by.get(key) ?? 0) + 1); } for (const [k, n] of [...by].slice(0, 10)) console.log('   ', n + 'x', k); }
    catch (e) { console.log(`${n}: ERROR ${(e as Error).message}`); }
  }
}
if (import.meta.url === `file://${process.argv[1]}`) main().then(() => process.exit(0));
