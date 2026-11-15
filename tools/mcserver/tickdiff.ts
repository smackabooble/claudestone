/**
 * PER-TICK sim vs REAL. The real server is FROZEN (`tick freeze`); the bot clicks the lever, then `tick step 1` runs ONE tick, the whole box is dumped (tools/mcserver/dump.sc) and compared
 * with the simulator after the same tick. Prints, per tick, how many cells differ and the first differing cells: the first tick with a difference is where the simulator's rules are wrong.
 * Usage: npx tsx tools/mcserver/tickdiff.ts   (edit the CASE at the bottom or import tickDiff)
 */
import { World } from '../../src/world.ts';
import { toBlockState } from '../../src/export.ts';
import { rcon, pasteWorld, clickBlock, cleanup } from './mc.ts';
import { dumpReal, parseState, findStand, lastItems } from './compare2.ts';
import { convertState } from '../../src/schematic.ts';
import type { Pos } from '../../src/dirs.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Cell = { name: string; props: Record<string, string> };
const IGN = (n: string, a: string) => (a === 'distance' && (n === 'leafblock' || n.endsWith('leaves'))) || (a === 'instrument' && n === 'note_block') || (n === 'redstone_wire' && ['north', 'east', 'south', 'west'].includes(a) && !process.env.SHAPES);

const str = (p: Record<string, any>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
function simCells(w: World, R: (p: Pos) => Pos): Map<string, Cell> {
  return new Map(w.listBlocks().map((b) => [R(b.pos).join(','), b.type === 'moving_piston' ? { name: 'moving_piston', props: {} } : { name: b.type, props: str(b.props) }] as const));
}
/** a real dump as the simulator would import it (same names and properties as simCells), so approximated blocks (tinted glass -> glass, cherry log -> log ...) compare equal */
function realAsSim(real: Map<string, Cell>): Map<string, Cell> {
  const out = new Map<string, Cell>();
  for (const [k, c] of real) {
    if (c.name === 'moving_piston') { out.set(k, c); continue; }
    const full = `minecraft:${c.name}${Object.keys(c.props).length ? '[' + Object.entries(c.props).map(([a, v]) => `${a}=${v}`).join(',') + ']' : ''}`;
    const cv = convertState(full, () => {}); if (!cv) continue; out.set(k, { name: cv.type, props: str(cv.props) });
  }
  return out;
}
function diff(sim: Map<string, Cell>, real: Map<string, Cell>): string[] {
  const out: string[] = [];
  for (const [k, e] of sim) {
    const r = real.get(k); if (!r) { out.push(`${k} sim ${e.name}, real nothing`); continue; }
    if (r.name !== e.name) { out.push(`${k} sim ${e.name}, real ${r.name}`); continue; }
    for (const [a, v] of Object.entries(e.props)) if (r.props[a] !== undefined && r.props[a] !== v && !IGN(e.name, a)) out.push(`${k} ${e.name}.${a} sim ${v} real ${r.props[a]}`);
  }
  for (const [k, r] of real) if (!sim.has(k)) out.push(`${k} sim nothing, real ${r.name}`);
  return out;
}

export async function tickDiff(label: string, build: (w: World) => { lever: Pos; raw?: Map<string, string>; items?: { pos: Pos; items: { slot: number; id: string; count: number }[] }[] }, settle: number, ticks: number, offsets = [-3, -2, -1, 0, 1, 2], verbose = 3) {
  const w = new World(); const built = build(w); const lever = built.lever; w.run(settle); w.settleWires();
  const bl = w.listBlocks().filter((b) => b.type !== 'moving_piston');
  const mn = [0, 1, 2].map((i) => Math.min(...bl.map((b) => b.pos[i]))), mx = [0, 1, 2].map((i) => Math.max(...bl.map((b) => b.pos[i])));
  const shift: Pos = [16 - mn[0], 100 - mn[1], 16 - mn[2]];
  const R = (p: Pos): Pos => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
  const lo = R([mn[0] - 4, mn[1] - 4, mn[2] - 4]), hi = R([mx[0] + 4, mx[1] + 4, mx[2] + 4]);
  const stand = findStand(w, lever); if (!stand) throw new Error('no stand for the bot');
  await rcon('tick unfreeze'); await rcon('tick rate 20'); await rcon(`forceload add ${lo[0]} ${lo[2]} ${hi[0]} ${hi[2]}`); await sleep(2000);
  await cleanup(lo, hi);
  if (built.raw) {     // paste the ORIGINAL vanilla blocks of the file (rails, tripwire hooks, composters, concrete powder ...), not the simulator's approximations; solid first, soft parts next, observers last
    const soft = (t: string) => ['redstone_wire', 'repeater', 'comparator', 'redstone_torch', 'redstone_wall_torch', 'lever', 'stone_button', 'redstone_lamp'].includes(t);
    const order = (b: { type: string }) => (b.type === 'observer' ? 2 : soft(b.type) ? 1 : 0);
    for (const ps of [0, 1, 2]) { for (const b of bl) { if (order(b) !== ps) continue; const rp = R(b.pos); const st = built.raw.get(b.pos.join(',')) ?? toBlockState({ type: b.type, p: b.props }); await rcon(`setblock ${rp.join(' ')} ${st} replace`); } if (ps === 1) await sleep(1500); }
  } else await pasteWorld(w, shift);
  for (const it of built.items ?? []) for (const x of it.items) { const r = await rcon(`item replace block ${R(it.pos).join(' ')} container.${x.slot} with minecraft:${x.id} ${x.count}`); if (process.env.DBG && x.slot === 0) console.log('item replace', R(it.pos).join(' '), x.id, '->', r); }   // container contents (the door's barrel of shovels sets a comparator level)
  await sleep(2500);
  // Pasting into the live server can start a machine by itself (observers), and the exported blocks are approximations of the original ones. So: let the REAL world settle
  // (sprint 800 ticks), dump it, and build the simulator's start state FROM THAT DUMP. Both sides then start from the identical, quiet state and only the dynamics are compared.
  await sleep(1500); await rcon('tick sprint 800'); for (let i = 0; i < 600; i++) { await sleep(100); if (!(await rcon('tick query')).includes('sprint')) break; }
  // optional PRE clicks ("x,y,z;x,y,z", in sim coordinates): done in the real world (unfrozen, with the bot) before the snapshot, e.g. to start the comparison from the state after note A
  for (const pre of (process.env.PRE ?? '').split(';').filter(Boolean)) {
    const tgt = pre.split(',').map(Number) as Pos, stp = findStand(w, tgt); if (!stp) throw new Error('no stand for PRE ' + pre);
    await clickBlock(R(stp), R(tgt), true); await sleep(800); await rcon('tick sprint 600'); for (let i = 0; i < 600; i++) { await sleep(100); if (!(await rcon('tick query')).includes('sprint')) break; }
    await rcon('player Lab kill').catch(() => ''); await rcon(`setblock ${R(stp)[0]} ${R(stp)[1] - 1} ${R(stp)[2]} minecraft:air`); await sleep(1200);
  }
  const settled = await dumpReal(lo, hi, 'tsettled');
  const w2 = new World(); const warns: string[] = [];
  for (const [k, c] of settled) {
    if (c.name === 'moving_piston' || c.name === 'piston_head' && false) continue;
    const full = `minecraft:${c.name}${Object.keys(c.props).length ? '[' + Object.entries(c.props).map(([a, v]) => `${a}=${v}`).join(',') + ']' : ''}`;
    const cv = convertState(full, (m) => warns.push(m)); if (!cv) continue;
    const [x, y, z] = k.split(',').map(Number); w2.setRaw([x - shift[0], y - shift[1], z - shift[2]], cv.type, { ...cv.props });
  }
  for (const [k, its] of lastItems) { const [x, y, z] = k.split(',').map(Number); for (const x2 of its) { try { w2.setItem([x - shift[0], y - shift[1], z - shift[2]], x2.slot, { id: x2.id, count: x2.count }); } catch { /* not a container in the simulator */ } } }
  w2.settleWires();
  const w3 = w2;                                   // the simulator world used for the comparison
  const start = simCells(w3, R);
  const base = diff(start, realAsSim(settled));
  console.log(`${label}: ${bl.length} blocks pasted, ${settled.size} in the settled real world; baseline differences (real settled vs sim built from it): ${base.length}${base.length ? ' (e.g. ' + base.slice(0, 3).join(' | ') + ')' : ''}`);
  if (process.env.BASE) for (const d of base) console.log('   base:', d);
  // bring the bot in place WITHOUT clicking yet, aim, then freeze
  const st = R(stand);
  await rcon(`setblock ${st[0]} ${st[1] - 1} ${st[2]} minecraft:obsidian`);
  for (let i = 0; i < 10; i++) { if ((await rcon('execute if entity Lab')).startsWith('Test passed')) break; await rcon(`player Lab spawn at ${st.join(' ')} facing 0 0 in minecraft:overworld`).catch(() => ''); await sleep(700); }
  await rcon(`tp Lab ${st.join(' ')}`); await sleep(400);
  const lv = R(lever);
  const before = (await rcon(`script run print(block_state(${lv.join(',')}))`)).match(/\{.*?\}/)?.[0] ?? '';
  const face = before.match(/face: (\w+)/)?.[1] ?? 'floor', facing = before.match(/facing: (\w+)/)?.[1] ?? 'north';
  const F: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }; const [fx, fz] = F[facing] ?? [0, 0];
  const aim = face === 'wall' ? [0.5 - 0.3 * fx, 0.5, 0.5 - 0.3 * fz] : face === 'ceiling' ? [0.5, 0.85, 0.5] : [0.5, 0.15, 0.5];
  await rcon(`player Lab look at ${lv[0] + aim[0]} ${lv[1] + aim[1]} ${lv[2] + aim[2]}`); await sleep(700);
  // SLOW MOTION instead of `tick freeze` (frozen stepping gave inconsistent results): 1 tick per second, snapshot after every tick (game time is read before and after the dump, only consistent ones count)
  const gameTime = async () => Number((await rcon('time query gametime')).match(/(\d+)/)?.[1]);
  await rcon('tick rate 1'); await sleep(1500);
  const snaps = new Map<number, Map<string, Cell>>();
  const snap = async (tag: string) => { for (let i = 0; i < 4; i++) { const t0 = await gameTime(); const m = await dumpReal(lo, hi, tag); const t1 = await gameTime(); if (t0 === t1) { if (!snaps.has(t0)) snaps.set(t0, m); return t0; } } return -1; };
  const leverState = async () => (await rcon(`script run print(block_state(${lv.join(',')}))`)).match(/\{.*?\}/)?.[0] ?? '';
  const tPre = await snap('tpre');
  await rcon('player Lab use once');
  for (let i = 0; i < 100000; i++) { await snap('tn'); if (snaps.size >= ticks + 6) break; }
  await rcon('tick rate 20');
  if (process.env.DBG) for (const k of [...snaps.keys()].sort((a, b) => a - b)) console.log('snap', k, JSON.stringify(snaps.get(k)!.get(lv.join(','))));
  // the click tick = first tick whose snapshot shows the lever flipped
  let k0 = -1; const keys = [...snaps.keys()].sort((a, b) => a - b);
  for (const k of keys) { const c = snaps.get(k)!.get(lv.join(',')); if (c && JSON.stringify(c.props) !== (before.match(/\{(.*)\}/) ? JSON.stringify(Object.fromEntries(before.replace(/[{}]/g, '').split(', ').map((x) => x.split(': ')))) : '')) { k0 = k; break; } }
  if (k0 < 0) throw new Error('the lever never flipped in the snapshots');
  console.log(`lever flipped in game tick ${k0} (first snapshot ${keys[0]}, last ${keys[keys.length - 1]}, ${keys.length} snapshots)`);
  const realSnaps: Map<string, Cell>[] = []; for (let t = 1; t <= ticks; t++) { const m = snaps.get(k0 + t - 1); if (!m) { console.log(`(missing snapshot for tick ${t}, stopping there)`); break; } realSnaps.push(realAsSim(m)); }
  ticks = realSnaps.length;
  const plat = `${st[0]},${st[1] - 1},${st[2]}`; for (const m of realSnaps) m.delete(plat);
  let best = { off: 0, score: Infinity };
  const simSnaps: Map<string, Cell>[] = []; w3.use(lever); for (let t = 0; t <= ticks + 3; t++) { simSnaps.push(simCells(w3, R)); w3.run(1); }
  for (const off of offsets) { let sc = 0; for (let t = 0; t < Math.min(ticks, 12); t++) sc += diff(simSnaps[Math.max(0, t + off)] ?? simSnaps[simSnaps.length - 1], realSnaps[t]).length; if (sc < best.score) best = { off, score: sc }; }
  if (process.env.OFF !== undefined) best = { off: Number(process.env.OFF), score: -1 };
  console.log(`best alignment: real tick t = sim tick t+${best.off} (differences over the first 12 ticks: ${best.score})`);
  const cellStr = (m: Map<string, Cell> | undefined, k: string) => { const c = m?.get(k); return c ? c.name + JSON.stringify(c.props).replace(/["{}]/g, '').replace(/,/g, ' ') : '-'; };
  for (const k of (process.env.WATCH ?? '').split(';').filter(Boolean)) { console.log(`watch ${k}`); for (let t = 0; t < Math.min(ticks, Number(process.env.WTICKS ?? 14)); t++) console.log(`   tick ${t + 1}: sim ${cellStr(simSnaps[Math.max(0, t + best.off)], k)}   real ${cellStr(realSnaps[t], k)}`); }
  let first = -1;
  for (let t = 0; t < ticks; t++) {
    const d = diff(simSnaps[Math.max(0, t + best.off)] ?? simSnaps[simSnaps.length - 1], realSnaps[t]);
    if (d.length && first < 0) first = t + 1;
    if (t < Number(process.env.SHOW ?? 3) || d.length && (first === t + 1 || t % 10 === 0)) { console.log(`tick ${t + 1}: ${d.length} cells differ`); for (const x of d.slice(0, Number(process.env.VERB ?? verbose))) console.log('      ', x); }
  }
  console.log(first < 0 ? `ALL ${ticks} TICKS IDENTICAL` : `first differing tick: ${first}`);
  await rcon('tick unfreeze'); await cleanup(lo, hi, [st]);
  return { first, best };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const { loadSchematic } = await import('../../src/schematic.ts');
  const which = process.env.CASE ?? 'lever';
  const s = loadSchematic(readFileSync(new URL(which === 'notes' ? '../../knowledge/refs/compact-5x5-lum3ndo.litematic' : '../../knowledge/refs/door-10x10-abfielder-real-open.litematic', import.meta.url)));
  const target: Pos = process.env.TARGET ? (process.env.TARGET.split(',').map(Number) as Pos) : which === 'notes' ? [1, 1, 0] : [6, 2, 0];
  await tickDiff(`${which === 'notes' ? 'compact-5x5-lum3ndo' : 'lum3ndo 5x5 (real open state)'}, click ${target.join(',')}`, (w) => {
    for (const b of s.blocks) w.setRaw(b.pos, b.type, b.props);
    return { lever: target, raw: process.env.RAW ? new Map(s.blocks.filter((b: any) => b.raw).map((b: any) => [b.pos.join(','), b.raw as string])) : undefined, items: process.env.RAW ? s.items : undefined };
  }, Number(process.env.SETTLE ?? 40), Number(process.env.TICKS ?? 60));
  process.exit(0);
}
