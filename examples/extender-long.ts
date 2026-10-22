/**
 * N-stage piston extender for any N (the "10 long" extender is N=10): same controller as flat-armN.ts, with the hold and
 * pulse waveforms computed instead of hand-searched. Run: npx tsx examples/extender-long.ts [N]
 *
 * Extension: P_k powered at 3(k-1) rt (tap x=2(k-1)), each piston pushes everything beyond it 1 block.
 * Retraction: P_N lets go first (3(N-1) rt), then P_N-1 ... P_1, 3 rt apart (P_1 one rt later). That leaves the arm as
 * P P . P . P . ... P . T (each retraction pulled only the piston next to its head). Then single-tick pulses close the gaps:
 * a piston at x with a free x+1 and a block at x+2 pulls that block to x+1. The shortest pulse order is found by BFS on a
 * tiny abstract model (it reproduces the hand-found orders for N=3..5), 4 rt apart, each 3 rt wide.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { buildFlatArm, buildLayeredArm, homeN, tipXN } from './flat-armN.ts';
import type { ArmSpec } from './flat-armN.ts';

export function pulseOrder(n: number): number[] {
  const len = 3 * n;
  const mk = (cells: Record<number, string>) => { const a = Array(len).fill('.'); for (const [i, c] of Object.entries(cells)) a[+i] = c; return a.join(''); };
  const init: Record<number, string> = { 0: 'P', [2 * n - 1]: 'T' }; for (let k = 1; k < n; k++) init[2 * k - 1] = 'P';
  const goal: Record<number, string> = { [n]: 'T' }; for (let k = 0; k < n; k++) goal[k] = 'P';
  const start = mk(init), end = mk(goal);
  const prev = new Map<string, [string, number]>([[start, ['', -1]]]);
  let fr = [start];
  while (fr.length && !prev.has(end)) {
    const nx: string[] = [];
    for (const s of fr) for (let x = 0; x + 2 < s.length; x++) {
      if (s[x] === 'P' && s[x + 1] === '.' && (s[x + 2] === 'P' || s[x + 2] === 'T')) {
        const a = s.split(''); a[x + 1] = a[x + 2]; a[x + 2] = '.'; const t = a.join('');
        if (!prev.has(t)) { prev.set(t, [s, x]); nx.push(t); }
      }
    }
    fr = nx;
  }
  const path: number[] = []; let c = end;
  while (c !== start) { const [p, x] = prev.get(c)!; path.push(x); c = p; }
  return path.reverse();
}

/** Faster return: pulses whose cells do not touch run at the same time. Each pulse waits `gap` rt after the last pulse
 *  (or retraction) that touched one of its cells x..x+2. */
export interface ArmTiming { gap?: number; width?: number; retract?: number; ext?: number; settle?: number; start?: number }
export function schedulePulses(n: number, order: number[], t: ArmTiming = {}): { x: number; at: number }[] {
  const gap = t.gap ?? 4, R = t.retract ?? 3, E = t.ext ?? 3, settle = t.settle ?? 2;
  const off = (k: number) => (k === 0 ? E * (n - 1) + R * (n - 1) + 1 : E * (n - 1) + R * (n - 1 - k)); // k = piston index 0..n-1
  const touch = new Map<number, number>();
  const mark = (c: number, v: number) => touch.set(c, Math.max(touch.get(c) ?? 0, v));
  for (let k = 0; k < n; k++) { mark(k === 0 ? 0 : 2 * k - 1, off(k) + settle); if (k > 0) mark(2 * k - 1, off(k - 1) + settle); }
  mark(2 * n - 1, off(n - 1) + settle);
  const out: { x: number; at: number }[] = [];
  for (const x of order) {
    let at = t.start ?? 0;
    for (let c = x; c <= x + 2; c++) at = Math.max(at, (touch.get(c) ?? 0) + (touch.has(c) ? 0 : 0));
    for (let c = x; c <= x + 2; c++) if (touch.has(c) && (touch.get(c)! > 0)) at = Math.max(at, touch.get(c)!);
    out.push({ x, at });
    for (let c = x; c <= x + 2; c++) mark(c, at + gap);
  }
  return out;
}

/** Faster preset (sim: 10-long extends in ~2.3 s and is home after ~9 s instead of ~25 s): independent pulses run in parallel,
 *  extension stages 2 rt apart. Less margin than the default; the sim tolerates gap 2 / width 2 as well. */
export const FAST: ArmTiming = { gap: 3, width: 3, retract: 3, ext: 2 };

export function makeArmSpec(n: number, opt: { K?: number; xw?: number; xe?: number; timing?: ArmTiming } = {}): ArmSpec {
  const order = pulseOrder(n);
  const tm = opt.timing; const E = tm?.ext ?? 3, R = tm?.retract ?? 3;
  const holds = Array.from({ length: n }, (_, i) => ({ x: 2 * i, on: E * i, off: i === 0 ? E * (n - 1) + R * (n - 1) + 1 : E * (n - 1) + R * (n - 1 - i) }));
  const width = tm?.width ?? 3;
  const sched = tm ? schedulePulses(n, order, tm) : order.map((x, i) => ({ x, at: 3 * n + 4 + 4 * i }));
  const pulses = sched.map(({ x, at }) => ({ x, side: at, rear: at + width }));
  const maxAbs = Math.max(...pulses.map((p) => p.rear), 6 * n);
  const K = opt.K ?? Math.max(16, Math.ceil(maxAbs / 6), 4 * n);
  const xw = opt.xw ?? -Math.ceil((K + maxAbs) / 4) - 8;
  const xe = opt.xe ?? Math.ceil((K + maxAbs) / 4) + 2 * n + 8;
  return { n, K, xw, xe, holds, pulses };
}

if (process.argv[1]?.endsWith('extender-long.ts')) {
  const n = Number(process.argv[2] ?? 10);
  const fast = process.argv[3] === 'fast';
  const layers = Number(process.argv[4] ?? 1);
  const spec = makeArmSpec(n, fast ? { timing: FAST } : {});
  console.log(`N=${n} layers=${layers} pulses=${spec.pulses.length} K=${spec.K} xw=${spec.xw} xe=${spec.xe}`);
  const build = (w: World) => (layers > 1 ? buildLayeredArm(w, spec, layers) : buildFlatArm(w, spec));
  const w = new World();
  const { lever } = build(w);
  const size = (() => { const b = w.listBlocks(); const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const k of b) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], k.pos[i]); mx[i] = Math.max(mx[i], k.pos[i]); } return mx.map((v, i) => v - mn[i] + 1).join('x'); })();
  console.log('built', w.listBlocks().length, 'blocks, size', size);
  const Y = 4 * (layers - 1);
  const tip = () => { for (let x = -1; x <= 3 * n + 2; x++) if (w.get([x, Y, 0]).type === 'stone') return x; return null; };
  const home = () => tip() === n && Array.from({ length: n }, (_, x) => x).every((x) => w.get([x, Y, 0]).type === 'sticky_piston' && !w.read([x, Y, 0], 'extended'));
  w.run(400);
  console.log('rest: home', home());
  const T = spec.pulses.at(-1)!.rear * 2 + 200;
  w.use(lever); w.run(T);
  console.log('lever ON: tip at', tip(), '(want', 2 * n + ')');
  w.use(lever); w.run(T + 200);
  console.log('lever OFF: tip at', tip(), 'home', home());
  const f = new World(); build(f); f.run(400);
  const name = `examples/extender-${n}${fast ? '-fast' : ''}${layers > 1 ? `-stacked${layers}` : ''}.schem`;
  writeFileSync(name, exportSchem(f).buffer);
  console.log('wrote', name);
}
