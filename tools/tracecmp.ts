/**
 * Replay a Carpet doortrace.sc trace in the simulator and compare tick by tick.
 * usage: npx tsx tools/tracecmp.ts <trace.txt> <lx,ly,lz of the lever to click> [offset]
 * The real state at tick T (start of tick) is the initial state plus all changes up to and including T.
 */
import { readFileSync } from 'node:fs';
import { convertState, loadSchematic } from '../src/schematic.ts';
import { World } from '../src/world.ts';

type Cell = { name: string; props: Record<string, string> };
const parseLine = (l: string): [string, Cell] | null => {
  const m = /^(-?\d+,-?\d+,-?\d+) ([a-z0-9_]+)\{(.*)\}$/.exec(l);
  if (!m) return null;
  const props: Record<string, string> = {};
  if (m[3].trim()) for (const kv of m[3].split(',')) { const [k, v] = kv.split(':').map((s) => s.trim()); props[k] = v; }
  return [m[1], { name: m[2], props }];
};
export function loadTrace(path: string) {
  const init = new Map<string, Cell>(); const ticks: { t: number; ch: [string, Cell][] }[] = [];
  let cur: { t: number; ch: [string, Cell][] } | null = null;
  for (const l of readFileSync(path, 'utf8').split('\n')) {
    if (l.startsWith('CLICK ')) continue;
    if (l.startsWith('T ')) { cur = { t: Number(l.slice(2)), ch: [] }; ticks.push(cur); continue; }
    const p = parseLine(l.trim()); if (!p) continue;
    if (cur) cur.ch.push(p); else init.set(p[0], p[1]);
  }
  return { init, ticks };
}
const warns: string[] = [];
export const toBlock = (c: Cell) => {
  if (c.name === 'air' || c.name === 'cave_air') return null;
  if (c.name === 'moving_piston') return { type: 'moving_piston', props: { facing: c.props.facing, type: c.props.type } as Record<string, any> };
  const full = `minecraft:${c.name}` + (Object.keys(c.props).length ? `[${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(',')}]` : '');
  return convertState(full, (m) => warns.push(m));
};

/** world from a map of trace cells; items (container contents, not in the trace) come from a litematic of the same build
 *  whose coordinates are offset by (ox,oy,oz) (the trace is in world coordinates). */
export function buildWorld(all: Map<string, Cell>, itemsFile?: string, off: [number, number, number] = [97, -10, 232]): World {
  const w = new World();
  for (const [k, c] of all) { const b = toBlock(c); if (b && b.type !== 'moving_piston') { const [x, y, z] = k.split(',').map(Number); w.setRaw([x, y, z], b.type, b.props); } }
  if (itemsFile) {
    const s = loadSchematic(readFileSync(itemsFile));
    for (const it of s.items ?? []) for (const i of it.items) { try { w.setItem([it.pos[0] + off[0], it.pos[1] + off[1], it.pos[2] + off[2]], i.slot, { id: i.id, count: i.count }); } catch { /* container not at this position */ } }
  }
  return w;
}
export const itemsFor = (phase: number): string | undefined => process.env.NOITEMS ? undefined : `knowledge/refs/door-10x10-abfielder-real-${phase % 2 === 0 ? 'closed' : 'open'}.litematic`;

/** one comparable token per cell */
export const sigOf = (type: string, p: Record<string, any>): string => {
  if (type === 'air') return '';
  if (type === 'moving_piston') return 'moving';
  if (type === 'piston' || type === 'sticky_piston') return `${type[0] === 's' ? 'S' : 'P'}:${p.facing}${p.extended ? '*' : ''}`;
  if (type === 'piston_head') return `head:${p.facing}`;
  if (type === 'observer') return `obs:${p.facing}${p.powered ? '!' : ''}`;
  if (type === 'redstone_block' || type === 'stone' || type === 'glass' || type === 'leaves' || type === 'slime_block' || type === 'honey_block') return type;
  return type;
};

if (process.argv[1]?.endsWith('tracecmp.ts')) {
  const [, , file, leverArg, offArg] = process.argv;
  const lever = leverArg.split(',').map(Number) as [number, number, number];
  const tr = loadTrace(file);
  const real = new Map<string, string>();
  const apply = (k: string, c: Cell) => { const b = toBlock(c); if (!b) real.delete(k); else real.set(k, sigOf(b.type, b.props)); };
  const w = new World();
  for (const [k, c] of tr.init) { apply(k, c); const b = toBlock(c); if (b && b.type !== 'moving_piston') { const [x, y, z] = k.split(',').map(Number); w.setRaw([x, y, z], b.type, b.props); } }
  w.run(100);
  // find the tick of the lever flip (first change containing the lever) and per phase
  const leverKey = lever.join(',');
  const flips = tr.ticks.filter((t) => t.ch.some(([k, c]) => k === leverKey && c.name === 'lever')).map((t) => ({ t: t.t, on: t.ch.find(([k]) => k === leverKey)![1].props.powered }));
  console.log('lever changes in trace:', JSON.stringify(flips));
  const phase = Number(process.env.PHASE ?? 0);
  const start = flips[phase].t;
  // replay real up to the tick before the chosen flip
  for (const t of tr.ticks) { if (t.t >= start) break; for (const [k, c] of t.ch) apply(k, c); }
  // re-sync the simulator to the real state just before the flip
  const all = new Map<string, Cell>(); for (const [k, c] of tr.init) all.set(k, c);
  for (const t of tr.ticks) { if (t.t >= start) break; for (const [k, c] of t.ch) all.set(k, c); }
  const w2 = buildWorld(all, itemsFor(phase));
  w2.run(2);
  w2.use(lever);
  const off = Number(offArg ?? 0);
  const simSig = (k: string) => { const [x, y, z] = k.split(',').map(Number); const b = w2.get([x, y, z]); return sigOf(b.type, b.p as any); };
  const t0 = start;
  let shown = 0;
  const ticksIdx = tr.ticks.filter((t) => t.t >= start);
  let simT = 0;
  for (const t of ticksIdx) {
    for (const [k, c] of t.ch) apply(k, c);
    // advance sim so that it is at (t.t - t0 + off) ticks after the click
    const want = t.t - t0 + off; while (simT < want) { w2.run(1); simT++; }
    const bad: string[] = [];
    for (const k of new Set([...real.keys(), ...[...all.keys()]])) { const a = real.get(k) ?? '', b = simSig(k); if (a !== b) bad.push(`${k} real=${a || 'air'} sim=${b || 'air'}`); }
    if (shown < Number(process.env.SHOW ?? 12) || bad.length === 0) console.log(`T+${t.t - t0}: ${bad.length} cells differ`);
    if (shown < Number(process.env.SHOW ?? 12)) { shown++; if (process.env.LIST) console.log(bad.slice(0, Number(process.env.LIST)).join('\n')); }
    if (t.t - t0 > Number(process.env.MAXT ?? 40)) break;
  }
}
