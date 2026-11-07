/**
 * Lab 2 (timing): compare a real-game recording (tools/gearrec.sc, `/gearrec full ...`) with the simulator, tick by tick.
 *   npx tsx tools/labtrace.ts sim [cell-substring]        print the simulator's events per probe
 *   npx tsx tools/labtrace.ts compare <rec.txt> <lever world x,y,z> [offset]
 * A probe's events are its state changes with the tick relative to the lever flick (ON = first lever change to powered, OFF = the next one).
 * The real tick of a flick can be 0 or 1 tick off the simulator's numbering: without [offset] the best of -1,0,1 is chosen and printed.
 */
import { readFileSync } from 'node:fs';

interface PrP { name: string; pos: number[]; obs: string[]; inv: boolean }
interface Fall { phase: string; t: number; pos: number[][] }
interface Ev { cell: string; name: string; init: string; on: [number, string][]; off: [number, string][] }
const lab = JSON.parse(readFileSync('examples/lab2-cells.txt', 'utf8')) as { lever: number[]; cells: { id: string; probes: PrP[] }[]; events: Ev[]; falling?: Fall[] };
const mode = process.argv[2];

const fmt = (e: [number, string][]) => e.map(([t, s]) => `${t}:${s.replace(/ \w+=-/g, '')}`).join('  ');

if (mode === 'sim') {
  const f = process.argv[3] ?? '';
  for (const e of lab.events.filter((x) => x.cell.includes(f))) console.log(`${e.cell} / ${e.name}\n   init ${e.init.replace(/ \w+=-/g, '')}\n   ON  ${fmt(e.on)}\n   OFF ${fmt(e.off)}`);
} else if (mode === 'compare') {
  const file = process.argv[3];
  const lv = (process.argv[4] ?? '').split(',').map(Number);
  if (!file || lv.length !== 3 || lv.some((v) => !Number.isFinite(v))) { console.log('usage: compare <rec.txt> <lever x,y,z> [offset]'); process.exit(1); }
  const off = lv.map((v, i) => v - lab.lever[i]);
  const parseState = (s: string): { name: string; props: Record<string, string> } => {
    const m = /^([a-z0-9_]+)\{(.*)\}$/.exec(s.trim()) ?? /^([a-z0-9_]+)$/.exec(s.trim());
    const props: Record<string, string> = {};
    if (m && m[2] && m[2].trim()) for (const kv of m[2].split(',')) { const [k, v] = kv.split(':').map((q) => q.trim()); props[k] = v; }
    return { name: m ? m[1] : s.trim(), props };
  };
  // per world position: the current block state string and inventory string; per tick the set of positions that changed
  const blocks = new Map<string, string>(), invs = new Map<string, string>();
  const changes: { t: number; keys: Set<string> }[] = [];
  let cur: { t: number; keys: Set<string> } | null = null;
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    if (l.startsWith('T ')) { cur = { t: Number(l.slice(2)), keys: new Set() }; changes.push(cur); continue; }
    if (l.startsWith('B ')) { const i = l.indexOf(' ', 2); const k = l.slice(2, i); blocks.set(k, l.slice(i + 1)); cur?.keys.add(k); continue; }
    if (l.startsWith('V ')) { const m = /^V (\S+) (\S+) (\[.*\])\s*$/.exec(l); if (m) { invs.set(m[1], m[3]); cur?.keys.add(m[1]); } continue; }
  }
  void blocks; void invs;
  // replay: rebuild state tick by tick
  const B = new Map<string, string>(), V = new Map<string, string>();
  const probes = lab.cells.flatMap((c) => c.probes.map((p) => ({ cell: c.id, p })));
  const key = (p: PrP) => p.pos.map((v, i) => v + off[i]).join(',');
  const read = (p: PrP): string => {
    const k = key(p);
    if (p.inv) return V.get(k) ?? '[]';
    const s = B.get(k);
    if (!s) return 'air';
    const { name, props } = parseState(s);
    if (name === 'air' || name === 'cave_air') return 'air';
    return [name, ...p.obs.map((o) => `${o}=${props[o] === undefined ? '-' : props[o]}`)].join(' ');
  };
  const leverKey = lab.lever.map((v, i) => v + off[i]).join(',');
  // second pass with state
  const lines = readFileSync(file, 'utf8').split('\n');
  let tNow = -1; const real: { t: number; i: number; v: string }[] = [];
  const probesByKey = new Map<string, number[]>();
  probes.forEach((q, i) => { const k = key(q.p); (probesByKey.get(k) ?? probesByKey.set(k, []).get(k)!).push(i); });
  const last: string[] = []; let started = false; let leverOn = -1, leverOff = -1;
  const touched = new Set<number>();
  const fall = new Map<number, number[][]>();
  const flush = () => { for (const i of touched) { const v = read(probes[i].p); if (started && v !== last[i]) real.push({ t: tNow, i, v }); last[i] = v; } touched.clear(); };
  for (const l of lines) {
    if (l.startsWith('T ')) { flush(); if (!started) { probes.forEach((q, i) => { last[i] = read(q.p); }); started = true; } tNow = Number(l.slice(2)); continue; }
    if (l.startsWith('B ')) {
      const i = l.indexOf(' ', 2); const k = l.slice(2, i); B.set(k, l.slice(i + 1));
      for (const pi of probesByKey.get(k) ?? []) touched.add(pi);
      if (k === leverKey && started) { const pw = /powered: (true|false)/.exec(l); if (pw?.[1] === 'true' && leverOn < 0) leverOn = tNow; if (pw?.[1] === 'false' && leverOn >= 0 && leverOff < 0) leverOff = tNow; }
      continue;
    }
    if (l.startsWith('F ') && started) { const q = l.split(' '); const arr = fall.get(tNow) ?? []; fall.set(tNow, arr); arr.push([Number(q[2]) - off[0], Number(q[3]) - off[1], Number(q[4]) - off[2], Number(q[7])]); continue; }
    if (l.startsWith('V ')) { const m = /^V (\S+) (\S+) (\[.*\])\s*$/.exec(l); if (m) { V.set(m[1], m[3]); for (const pi of probesByKey.get(m[1]) ?? []) touched.add(pi); } }
  }
  flush();
  if (leverOn < 0) { console.log('no lever ON change found in the recording (is the lever position right?)'); process.exit(1); }
  console.log(`lever ON at tick ${leverOn}, OFF at tick ${leverOff}`);
  const realEv = probes.map((_, i) => ({ on: [] as [number, string][], off: [] as [number, string][] }));
  for (const r of real) {
    if (r.t >= leverOn && (leverOff < 0 || r.t < leverOff)) realEv[r.i].on.push([r.t - leverOn, r.v]);
    else if (leverOff >= 0 && r.t >= leverOff) realEv[r.i].off.push([r.t - leverOff, r.v]);
  }
  const same = (a: [number, string][], b: [number, string][], d: number) => a.length === b.length && a.every((x, j) => x[0] === b[j][0] + d && x[1] === b[j][1]);
  const score = (d: number) => lab.events.reduce((n, e, i) => n + (same(realEv[i].on, e.on, d) ? 1 : 0) + (same(realEv[i].off, e.off, d) ? 1 : 0), 0);
  let delta = process.argv[5] !== undefined ? Number(process.argv[5]) : [-1, 0, 1].reduce((best, d) => (score(d) > score(best) ? d : best), 0);
  console.log(`time offset real = sim + ${delta}  (matching probe phases: ${score(delta)} of ${lab.events.length * 2})`);
  let bad = 0; const byCell = new Map<string, string[]>();
  lab.events.forEach((e, i) => {
    for (const ph of ['on', 'off'] as const) {
      if (!same(realEv[i][ph], e[ph], delta)) {
        bad++;
        const arr = byCell.get(e.cell) ?? []; byCell.set(e.cell, arr);
        arr.push(`   ${e.name} ${ph.toUpperCase()}\n      sim : ${fmt(e[ph]) || '(no change)'}\n      real: ${fmt(realEv[i][ph].map(([t, s]) => [t - delta, s] as [number, string])) || '(no change)'}`);
      }
    }
  });
  for (const [cell, arr] of byCell) console.log(`${cell}\n${arr.join('\n')}`);
  // falling blocks: positions (relative to the lab) every tick; the simulator's numbers come from lab2-cells.txt
  const simF = lab.falling ?? [];
  if (simF.length || fall.size) {
    console.log('\nFALLING BLOCKS (x,y,z of the block bottom; sim | real), tick relative to the flick');
    for (const ph of ['on', 'off'] as const) {
      const base = ph === 'on' ? leverOn : leverOff; if (base < 0) continue;
      const ticks = new Set<number>([...simF.filter((f) => f.phase === ph).map((f) => f.t + delta), ...[...fall.keys()].filter((t) => t >= base && (ph === 'off' || leverOff < 0 || t < leverOff)).map((t) => t - base)]);
      for (const t of [...ticks].sort((a, b) => a - b)) {
        const s2 = simF.find((f) => f.phase === ph && f.t + delta === t)?.pos ?? []; const r2 = fall.get(base + t) ?? [];
        const f3 = (a: number[][]) => a.map((q) => `y=${q[1].toFixed(2)} vy=${q[3]?.toFixed?.(3) ?? '?'}`).join('; ') || '-';
        console.log(`  ${ph.toUpperCase()} t=${String(t).padStart(3)}  sim: ${f3(s2).padEnd(34)} real: ${f3(r2)}`);
      }
    }
  }
  console.log(`\nprobe phases that differ: ${bad} of ${lab.events.length * 2}; cells with a difference: ${byCell.size} of ${lab.cells.length}`);
} else console.log('usage: labtrace.ts sim [filter] | compare <rec.txt> <lever x,y,z> [offset]');
