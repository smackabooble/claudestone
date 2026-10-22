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
import { buildFlatArm, homeN, tipXN } from './flat-armN.ts';
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

export function makeArmSpec(n: number, opt: { K?: number; xw?: number; xe?: number } = {}): ArmSpec {
  const order = pulseOrder(n);
  const holds = Array.from({ length: n }, (_, i) => ({ x: 2 * i, on: 3 * i, off: i === 0 ? 6 * (n - 1) + 1 : 3 * (n - 1) + 3 * (n - 1 - i) }));
  const start = 3 * n + 4;
  const pulses = order.map((x, i) => ({ x, side: start + 4 * i, rear: start + 3 + 4 * i }));
  const maxAbs = pulses.length ? pulses[pulses.length - 1].rear : 6 * n;
  const K = opt.K ?? Math.max(16, Math.ceil(maxAbs / 6));
  const xw = opt.xw ?? -Math.ceil((K + maxAbs) / 4) - 8;
  const xe = opt.xe ?? Math.ceil((K + maxAbs) / 4) + 2 * n + 8;
  return { n, K, xw, xe, holds, pulses };
}

if (process.argv[1]?.endsWith('extender-long.ts')) {
  const n = Number(process.argv[2] ?? 10);
  const spec = makeArmSpec(n);
  console.log(`N=${n} pulses=${spec.pulses.length} order=${pulseOrder(n).join(' ')} K=${spec.K} xw=${spec.xw} xe=${spec.xe}`);
  const w = new World();
  const { lever } = buildFlatArm(w, spec);
  const size = (() => { const b = w.listBlocks(); const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const k of b) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], k.pos[i]); mx[i] = Math.max(mx[i], k.pos[i]); } return mx.map((v, i) => v - mn[i] + 1).join('x'); })();
  console.log('built', w.listBlocks().length, 'blocks, size', size);
  w.run(400);
  console.log('rest: home', homeN(w, n));
  w.use(lever); w.run(spec.pulses.at(-1)!.rear * 2 + 200);
  console.log('lever ON: tip at', tipXN(w, n), '(want', 2 * n + ')');
  w.use(lever); w.run(spec.pulses.at(-1)!.rear * 2 + 400);
  console.log('lever OFF: tip at', tipXN(w, n), 'home', homeN(w, n));
  const f = new World(); buildFlatArm(f, spec); f.run(400);
  writeFileSync(`examples/extender-${n}.schem`, exportSchem(f).buffer);
  console.log(`wrote examples/extender-${n}.schem`);
}
