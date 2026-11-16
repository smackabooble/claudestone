/**
 * Does MY real server reproduce the USER's real game? Start from the state of the user's own Carpet trace (knowledge/refs/lum3ndo-real-trace*.txt, world coordinates), paste it with the
 * original vanilla blocks + container items, click the lever in slow motion and compare my real snapshots tick by tick with the states the user's real trace recorded.
 * Usage: PHASE=0 npx tsx tools/mcserver/tracereal.ts <trace> [ticks]      (PHASE = which lever flip of the trace to replay)
 */
import { readFileSync } from 'node:fs';
import { loadTrace, toBlock, sigOf } from '../../src/../tools/tracecmp.ts';
import { loadSchematic } from '../../src/schematic.ts';
import { rcon, clickBlock, cleanup } from './mc.ts';
import { dumpReal, findStand, lastItems } from './compare2.ts';
import { World } from '../../src/world.ts';
import type { Pos } from '../../src/dirs.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Cell = { name: string; props: Record<string, string> };
const full = (c: Cell) => `minecraft:${c.name}${Object.keys(c.props).length ? '[' + Object.entries(c.props).map(([a, v]) => `${a}=${v}`).join(',') + ']' : ''}`;
const sig = (c: Cell | undefined): string => { if (!c) return ''; const b = toBlock(c); return b ? sigOf(b.type, b.props) : ''; };

async function main() {
  const file = process.argv[2], ticks = Number(process.argv[3] ?? 40), phase = Number(process.env.PHASE ?? 0);
  const lever: Pos = (process.env.LEVER ?? '103,-8,232').split(',').map(Number) as Pos;
  const tr = loadTrace(file);
  const leverKey = lever.join(',');
  const flips = tr.ticks.filter((t) => t.ch.some(([k, c]) => k === leverKey && c.name === 'lever')).map((t) => t.t);
  const start = flips[phase];
  const state = new Map<string, Cell>(tr.init);                  // user's real state just before the flip
  for (const t of tr.ticks) { if (t.t >= start) break; for (const [k, c] of t.ch) { if (c.name === 'air' || c.name === 'cave_air') state.delete(k); else state.set(k, c); } }
  const keys = [...state.keys()].map((k) => k.split(',').map(Number) as Pos);
  const mn = [0, 1, 2].map((i) => Math.min(...keys.map((p) => p[i]))), mx = [0, 1, 2].map((i) => Math.max(...keys.map((p) => p[i])));
  const shift: Pos = [16 - mn[0], 100 - mn[1], 16 - mn[2]];
  const R = (p: Pos): Pos => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
  const lo = R([mn[0] - 4, mn[1] - 4, mn[2] - 4]), hi = R([mx[0] + 4, mx[1] + 4, mx[2] + 4]);
  const w = new World();   // only for the bot's standing cell
  for (const [k, c] of state) { const b = toBlock(c); if (b && b.type !== 'moving_piston') w.setRaw(k.split(',').map(Number) as Pos, b.type, b.props); }
  const stand = findStand(w, lever); if (!stand) throw new Error('no stand');
  await rcon('tick unfreeze'); await rcon('tick rate 20'); await rcon(`forceload add ${lo[0]} ${lo[2]} ${hi[0]} ${hi[2]}`); await sleep(2000);
  await cleanup(lo, hi);
  const soft = (n: string) => ['redstone_wire', 'repeater', 'comparator', 'redstone_torch', 'redstone_wall_torch', 'lever', 'stone_button', 'redstone_lamp'].includes(n);
  const order = (c: Cell) => (c.name === 'observer' ? 2 : soft(c.name) ? 1 : 0);
  let moving = 0;
  for (const ps of [0, 1, 2]) { for (const [k, c] of state) { if (order(c) !== ps) continue; if (c.name === 'moving_piston') { moving++; continue; } const rp = R(k.split(',').map(Number) as Pos); await rcon(`setblock ${rp.join(' ')} ${full(c)} replace`); } if (ps === 1) await sleep(1500); }
  const items = loadSchematic(readFileSync(`knowledge/refs/door-10x10-abfielder-real-${phase % 2 === 0 ? 'closed' : 'open'}.litematic`)).items ?? [];
  for (const it of items) for (const x of it.items) await rcon(`item replace block ${R([it.pos[0] + 97, it.pos[1] - 10, it.pos[2] + 232]).join(' ')} container.${x.slot} with minecraft:${x.id} ${x.count}`);
  console.log(`trace ${file}: pasted ${state.size - moving} blocks (${moving} mid-motion pistons skipped), flip at trace tick ${start}`);
  await sleep(2500); await rcon('tick sprint 800'); for (let i = 0; i < 600; i++) { await sleep(100); if (!(await rcon('tick query')).includes('sprint')) break; }
  const settled = await dumpReal(lo, hi, 'trsettled');
  let nb = 0; for (const [k, c] of state) { if (c.name === 'moving_piston') continue; const r = settled.get(R(k.split(',').map(Number) as Pos).join(',')); if (sig(c) !== sig(r)) nb++; }
  console.log(`baseline: my settled real world differs from the user's real pre-click state in ${nb} cells`);
  // bot + slow motion
  const st = R(stand), lv = R(lever);
  await rcon(`setblock ${st[0]} ${st[1] - 1} ${st[2]} minecraft:obsidian`);
  for (let i = 0; i < 10; i++) { if ((await rcon('execute if entity Lab')).startsWith('Test passed')) break; await rcon(`player Lab spawn at ${st.join(' ')} facing 0 0 in minecraft:overworld`).catch(() => ''); await sleep(700); }
  await rcon(`tp Lab ${st.join(' ')}`); await sleep(400);
  const lstate = async () => (await rcon(`script run print(block_state(${lv.join(',')}))`)).match(/\{.*?\}/)?.[0] ?? '';
  const before = await lstate(); const [fx, fz] = ({ north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] } as any)[before.match(/facing: (\w+)/)?.[1] ?? 'north'];
  await rcon(`player Lab look at ${lv[0] + 0.5 - 0.3 * fx} ${lv[1] + 0.5} ${lv[2] + 0.5 - 0.3 * fz}`); await sleep(700);
  const gameTime = async () => Number((await rcon('time query gametime')).match(/(\d+)/)?.[1]);
  await rcon('tick rate 1'); await sleep(1500);
  const snaps = new Map<number, Map<string, Cell>>();
  const snap = async () => { for (let i = 0; i < 4; i++) { const t0 = await gameTime(); const m = await dumpReal(lo, hi, 'trn'); const t1 = await gameTime(); if (t0 === t1) { if (!snaps.has(t0)) snaps.set(t0, m); return; } } };
  await snap(); await rcon('player Lab use once');
  for (let i = 0; i < 100000; i++) { await snap(); if (snaps.size >= ticks + 6) break; }
  await rcon('tick rate 20');
  const ks = [...snaps.keys()].sort((a, b) => a - b); let k0 = -1;
  for (const k of ks) if ((await Promise.resolve(snaps.get(k)!.get(lv.join(',')))) && snaps.get(k)!.get(lv.join(','))!.props.powered !== before.match(/powered: (\w+)/)?.[1]) { k0 = k; break; }
  if (k0 < 0) throw new Error('lever never flipped');
  // the user's real trace states per tick: state at trace tick T = init + all changes up to and including T
  const user: Map<string, Cell>[] = []; const run = new Map<string, Cell>(state); const after = tr.ticks.filter((t) => t.t >= start);
  let ai = 0; for (let T = start; T < start + ticks + 6; T++) { while (ai < after.length && after[ai].t <= T) { for (const [k, c] of after[ai].ch) { if (c.name === 'air' || c.name === 'cave_air') run.delete(k); else run.set(k, c); } ai++; } user.push(new Map(run)); }
  const mine = (t: number) => snaps.get(k0 + t); // t=0 is the click tick
  let best = { off: 0, sc: Infinity };
  for (const off of [-2, -1, 0, 1, 2]) { let sc = 0; for (let t = 0; t < 12; t++) { const a = mine(t + 0), b = user[Math.max(0, t + off)]; if (!a || !b) continue; const keys2 = new Set([...b.keys()]); for (const k of keys2) if (sig(b.get(k)) !== sig(a.get(R(k.split(',').map(Number) as Pos).join(','))) ) sc++; } if (sc < best.sc) best = { off, sc }; }
  console.log(`best alignment: my click tick t = user trace tick T+${best.off} (differing cells over 12 ticks: ${best.sc})`);
  let first = -1;
  for (let t = 0; t < ticks; t++) {
    const a = mine(t), b = user[Math.max(0, t + best.off)]; if (!a || !b) break;
    const bad: string[] = []; for (const [k, c] of b) { const rk = R(k.split(',').map(Number) as Pos).join(','); if (sig(c) !== sig(a.get(rk))) bad.push(`${k} user=${sig(c) || 'air'} mine=${sig(a.get(rk)) || 'air'}`); }
    if (bad.length && first < 0) first = t;
    if (t < 3 || (bad.length && (first === t || t % 10 === 0))) { console.log(`tick ${t}: ${bad.length} cells differ`); for (const x of bad.slice(0, Number(process.env.VERB ?? 6))) console.log('    ', x); }
  }
  console.log(first < 0 ? `MY REAL SERVER == THE USER'S REAL GAME for ${ticks} ticks` : `first difference at tick ${first}`);
  await cleanup(lo, hi, [st]);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
