/**
 * OFFLINE replay: compare the simulator with a recording of the REAL game (tools/mcserver/tickdiff.ts SAVE=...) without any server. Builds the sim from the recording's settled start state,
 * flips the lever, and diffs every tick. Usage: npx tsx tools/mcserver/replay.ts knowledge/refs/real/door-closed-lever-off.json [offset] [ticks]
 * Prints the number of differing cells per tick (summary) and the first differing cells; env SHOW=n lists the first n ticks that differ.
 */
import { readFileSync } from 'node:fs';
import { World } from '../../src/world.ts';
import { convertState } from '../../src/schematic.ts';
import { simCells, realAsSim, diff } from './tickdiff.ts';
import type { Pos } from '../../src/dirs.ts';

type Cell = { name: string; props: Record<string, string> };
export function replay(file: string, off = 0, nTicks = 60, verbose = false): { first: number; counts: number[]; w: World } {
  const rec = JSON.parse(readFileSync(file, 'utf8')) as { shift: Pos; lever: Pos; settled: [string, string, Record<string, string>][]; snaps: [string, string, Record<string, string>][][] };
  const w = new World();
  for (const [k, name, props] of rec.settled) {
    const { inv, ...rest } = props as Record<string, string>;
    const full = `minecraft:${name}${Object.keys(rest).length ? '[' + Object.entries(rest).map(([a, v]) => `${a}=${v}`).join(',') + ']' : ''}`;
    const cv = convertState(full, () => {}); if (!cv) continue;
    const [x, y, z] = k.split(',').map(Number); w.setRaw([x - rec.shift[0], y - rec.shift[1], z - rec.shift[2]], cv.type, { ...cv.props });
    if (inv) for (const it of inv.split(',').filter(Boolean)) { const m = it.match(/^(\d+):(.+)x(\d+)$/); if (m) try { w.setItem([x - rec.shift[0], y - rec.shift[1], z - rec.shift[2]], +m[1], { id: m[2], count: +m[3] }); } catch { /* */ } }
  }
  w.settleWires();
  const R = (p: Pos): Pos => [p[0] + rec.shift[0], p[1] + rec.shift[1], p[2] + rec.shift[2]];
  if (process.env.DEBUGT) { const ot = (w as any).tickBlock.bind(w); (w as any).tickBlock = (p: number[], ...a: any[]) => { if (w.time <= Number(process.env.DEBUGT)) console.log(`  [t${w.time}] tickBlock ${R(p as any).join(',')} ${w.get(p as any).type}`); return ot(p, ...a); }; }
  if (process.env.DEBUGP) {   // DEBUGP="x,y,z" (REAL coordinates): log every time the sim recomputes this dust and who caused it
    const q = process.env.DEBUGP.split(',').map(Number); const sp = [q[0] - rec.shift[0], q[1] - rec.shift[1], q[2] - rec.shift[2]].join(',');
    let curTick = ''; const ot2 = (w as any).tickBlock.bind(w); (w as any).tickBlock = (p2: number[], ...a: any[]) => { curTick = `${R(p2 as any).join(',')} ${w.get(p2 as any).type}`; try { return ot2(p2, ...a); } finally { curTick = ''; } };
    const orig = (w as any).updatePowerStrength.bind(w);
    (w as any).updatePowerStrength = (p: number[]) => { if (p.join(',') === sp) { const before = w.get(p as any).p.power; (w as any).wireShouldSignal = false; const dirs = ['down', 'up', 'north', 'south', 'west', 'east'] as const; const sig = dirs.map((d) => { const o: any = { down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] }[d]; const nb = [p[0] + o[0], p[1] + o[1], p[2] + o[2]]; return `${d}:${w.get(nb as any).type}=${(w as any).getSignal(nb, d)}`; }).join(' '); (w as any).wireShouldSignal = true; if (process.env.DEBUGSIG) console.log('   signals into the dust:', sig); orig(p); console.log(`  [t${w.time}] dust ${q.join(',')} power ${before} -> ${w.get(p as any).p.power}  (ticking: ${curTick || '-'}) via`, new Error().stack!.split('\n').slice(2, 9).map((x) => x.trim().replace(/\(.*src\//, '(').replace(/^at /, '')).join(' < ')); } else orig(p); };
  }
  const simSnaps: Map<string, Cell>[] = []; w.use([rec.lever[0] - rec.shift[0], rec.lever[1] - rec.shift[1], rec.lever[2] - rec.shift[2]]);
  for (let t = 0; t <= nTicks + 6; t++) { simSnaps.push(simCells(w, R)); w.run(1); }
  const real = rec.snaps.map((s) => realAsSim(new Map(s.map(([k, n, p]) => [k, { name: n, props: p }] as const))));
  const counts: number[] = []; let first = -1;
  for (let t = 0; t < Math.min(nTicks, real.length); t++) {
    const d = diff(simSnaps[Math.max(0, t + off)] ?? simSnaps[simSnaps.length - 1], real[t]).filter((x) => !/sim nothing, real obsidian/.test(x));   // the bot's standing platform is in the recording only
    counts.push(d.length); if (d.length && first < 0) first = t + 1;
    if (verbose && d.length && Number(process.env.SHOW ?? 0) > counts.filter((c) => c > 0).length - 1) { console.log(`tick ${t + 1}: ${d.length} cells differ`); for (const x of d.slice(0, 8)) console.log('     ', x); }
  }
  if (process.env.WATCH) for (const k of process.env.WATCH.split(';')) { console.log('watch', k); for (let t = 0; t < Math.min(nTicks, 16); t++) { const a = simSnaps[Math.max(0, t + off)]?.get(k), b = real[t]?.get(k); const f = (c?: Cell) => (c ? c.name + JSON.stringify(c.props).replace(/["{}]/g, '') : '-'); console.log(`   tick ${t + 1}: sim ${f(a)} | real ${f(b)}`); } }
  return { first, counts, w };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , file, offArg, ticksArg] = process.argv;
  const r = replay(file ?? 'knowledge/refs/real/door-closed-lever-off.json', Number(offArg ?? 0), Number(ticksArg ?? 60), true);
  console.log(`first differing tick: ${r.first}; cells differing per tick: ${r.counts.join(' ')}`);
  console.log(`total differing cells over the run: ${r.counts.reduce((a, b) => a + b, 0)}`);
}
