/**
 * Flat TRIPLE piston extender (3 stages). Arm along +x at y=0, z=0; the tip travels 3 blocks.
 *   P1 (x0)  P2 (x1)  P3 (x2)  X (x3)   ->   lever ON: P1, then P2, then P3 extend; X ends at x=6.
 * Return (lever OFF): P3 off, P2 off (pulls P3 back), P1 off (pulls P2 back), then three short pulses:
 * P3 (pulls X 1), P2 (pulls P3 home), P3 again (pulls X home). See knowledge/LEARNINGS.md.
 *
 * Controller (no observers/torches): each piston is powered through a tap = stone beside the arm with dust on top.
 *   N taps x0: P1 | x2: P2 + pulse(P3) | x4: P3      S taps x1: pulse(P2) | x3: pulse(P3)
 * Waveforms are delayed copies L_d of the lever (repeater chains), merged by dust (= OR). A pulse is a comparator in
 * SUBTRACT mode (rear = L_late, side = L_early), both fed straight from repeaters -> clean 15 pulse at the falling edge.
 * One trunk (dust + a repeater every ~12 cells) carries L; every chain is shortened by the trunk delay up to its
 * branch point so all waveforms share the same absolute time base (K + d).
 * Rules that bit us: dust lines side by side MERGE (keep lanes 2 apart); repeater chains side by side do not interact.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Dir, Pos } from '../src/dirs.ts';
import { opposite } from '../src/dirs.ts';

export interface Flat3Timing {
  /** common time-base offset in repeater ticks (rt); must exceed the largest trunk delay */
  K: number;
  /** P1 off, P2 on, P2 off, P3 on/off (rt after the lever flips) */
  w1Off: number; w2On: number; w2Off: number; w3: number;
  /** pulses: [side edge, rear edge] (rt); output is high between them (+1 rt comparator delay) */
  p1: [number, number]; p2: [number, number]; p3: [number, number];
}
export const FLAT3_TIMING: Flat3Timing = {
  K: 8, w1Off: 13, w2On: 3, w2Off: 9, w3: 6, p1: [12, 15], p2: [16, 19], p3: [19, 22],
};

/** split a delay into repeater settings of 1..4 */
export const segs = (total: number): number[] => {
  if (total < 1) throw new Error(`delay ${total} < 1`);
  const out: number[] = [];
  for (let left = total; left > 0; left -= 4) out.push(Math.min(4, left));
  return out;
};

type XZ = [number, number];
const dirOf = (a: XZ, b: XZ): Dir => (b[0] > a[0] ? 'east' : b[0] < a[0] ? 'west' : b[1] > a[1] ? 'south' : 'north');
const line = (a: XZ, b: XZ): XZ[] => {
  const out: XZ[] = [];
  const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
  for (let p: XZ = [a[0], a[1]]; ; p = [p[0] + dx, p[1] + dz]) { out.push([p[0], p[1]]); if (p[0] === b[0] && p[1] === b[1]) break; }
  return out;
};

export function buildFlatArm3(w: World, t: Flat3Timing = FLAT3_TIMING): { lever: Pos; tip: Pos } {
  const floor = new Set<string>();
  const under = (x: number, z: number) => { const k = `${x},${z}`; if (!floor.has(k)) { floor.add(k); w.place([x, 0, z], 'obsidian'); } };
  const dust = (x: number, z: number) => { under(x, z); w.place([x, 1, z], 'redstone_wire'); };
  const rep = (x: number, z: number, outDir: Dir, delay: number) => { under(x, z); w.place([x, 1, z], 'repeater', { facing: opposite(outDir), delay }); };
  const tap = (x: number, z: number) => { floor.add(`${x},${z}`); w.place([x, 0, z], 'stone'); };
  const cmp = (x: number, z: number, outDir: Dir) => { under(x, z); w.place([x, 1, z], 'comparator', { facing: opposite(outDir), mode: 'subtract' }); };

  // ---- the arm ----
  for (const x of [0, 1, 2]) w.place([x, 0, 0], 'sticky_piston', { facing: 'east' });
  w.place([3, 0, 0], 'stone');

  // ---- trunk: lever (2,-24) -> top row z=-23; west path -> x=-9 -> bottom row z=13; east path -> x=13 ----
  const attach = new Set(['-9,-9', '-9,-6', '-9,-4', '-9,4', '1,13', '3,13', '13,-3', '13,-9', '13,-12', '13,4', '2,-23']);
  const westPath: XZ[] = [...line([2, -23], [-9, -23]), ...line([-9, -22], [-9, 13]).slice(0), ...line([-8, 13], [3, 13])];
  const eastPath: XZ[] = [...line([3, -23], [13, -23]), ...line([13, -22], [13, 4])];
  const trunkDelay = new Map<string, number>(); // repeaters strictly before the cell
  const layTrunk = (path: XZ[], startCount: number) => {
    let count = startCount, since = 0;
    path.forEach((c, i) => {
      const key = `${c[0]},${c[1]}`;
      if (!trunkDelay.has(key)) trunkDelay.set(key, count);
      const prev = path[i - 1] ?? [c[0], c[1] + 1] as XZ, next = path[i + 1];
      const straight = next && prev && dirOf(prev, c) === dirOf(c, next);
      since++;
      if (since >= 8 && straight && !attach.has(key) && i > 0) {
        rep(c[0], c[1], dirOf(c, next), 1); count++; since = 0;
      } else dust(c[0], c[1]);
    });
  };
  layTrunk(westPath, 0);
  layTrunk(eastPath.slice(1), 0); // (3,-23) onwards; (2,-23) is shared and delay 0
  dust(3, -23);
  w.place([2, 0, -24], 'obsidian'); floor.add('2,-24');
  w.place([2, 1, -24], 'lever', { face: 'floor' });
  const td = (c: XZ) => trunkDelay.get(`${c[0]},${c[1]}`) ?? 0;

  /** chain along `cells` (flow order, last cell feeds the consumer). `at` = trunk cell it hangs on. */
  const chain = (cells: XZ[], at: XZ, abs: number) => {
    const D = t.K + abs - td(at);
    // use as many cells as possible as repeaters (they regenerate the signal); spare cells become dust at the trunk end
    const n = Math.min(cells.length, D);
    if (D > 4 * n) throw new Error(`chain ${cells[0]}->${cells[cells.length - 1]}: delay ${D} does not fit ${cells.length} cells`);
    const s = Array.from({ length: n }, (_, i) => Math.floor(D / n) + (i < D % n ? 1 : 0));
    const first = cells.length - n;
    cells.forEach((c, i) => {
      if (i < first) { dust(c[0], c[1]); return; }
      const next = cells[i + 1] ?? null;
      const dir = next ? dirOf(c, next) : lastDir;
      rep(c[0], c[1], dir, s[i - first]);
    });
  };
  let lastDir: Dir = 'east';
  const run = (cells: XZ[], at: XZ, abs: number, dirIntoConsumer: Dir) => { lastDir = dirIntoConsumer; chain(cells, at, abs); };

  // ---- N tap x0: OR of L_0 (row z=-6 -> dust down the lane) and L_w1Off (row z=-4) ----
  tap(0, -1);
  for (const z of [-1, -2, -3, -4]) dust(0, z);
  run(line([-8, -6], [-1, -6]), [-9, -6], 0, 'east'); dust(0, -6); dust(0, -5);
  run(line([-8, -4], [-1, -4]), [-9, -4], t.w1Off, 'east');

  // ---- N tap x4: L_w3 ----
  tap(4, -1);
  for (const z of [-1, -2, -3]) dust(4, z);
  run(line([12, -3], [5, -3]), [13, -3], t.w3, 'west');

  // ---- N tap x2: OR(L_w2On, L_w2Off, pulse3) ----
  tap(2, -1);
  for (let z = -1; z >= -11; z--) dust(2, z);
  run(line([-8, -9], [1, -9]), [-9, -9], t.w2On, 'east');
  run(line([12, -9], [3, -9]), [13, -9], t.w2Off, 'west');
  cmp(2, -12, 'south');
  run(line([2, -22], [2, -13]), [2, -23], t.p3[1], 'south');
  run(line([12, -12], [3, -12]), [13, -12], t.p3[0], 'west');

  // ---- S tap x1: pulse(P2) comparator at (1,4) output north; S tap x3: pulse(P3) comparator at (3,4) ----
  tap(1, 1); tap(3, 1);
  for (const z of [1, 2, 3]) { dust(1, z); dust(3, z); }
  cmp(1, 4, 'north'); cmp(3, 4, 'north');
  run(line([-8, 4], [0, 4]), [-9, 4], t.p2[0], 'east');
  run(line([1, 12], [1, 5]), [1, 13], t.p2[1], 'north');
  run(line([12, 4], [4, 4]), [13, 4], t.p1[0], 'west');
  run(line([3, 12], [3, 5]), [3, 13], t.p1[1], 'north');

  return { lever: [2, 1, -24], tip: [3, 0, 0] };
}

/** x of the stone tip on the arm line, or null */
export function tipX3(w: World): number | null {
  for (let x = -1; x <= 12; x++) if (w.get([x, 0, 0]).type === 'stone') return x;
  return null;
}
export const home3 = (w: World): boolean =>
  tipX3(w) === 3 && [0, 1, 2].every((x) => w.get([x, 0, 0]).type === 'sticky_piston' && !w.read([x, 0, 0], 'extended'));

if (process.argv[1]?.endsWith('flat-arm3.ts')) {
  const w = new World();
  buildFlatArm3(w);
  w.run(200);
  writeFileSync('examples/flat-arm3.schem', exportSchem(w).buffer);
  console.log('wrote examples/flat-arm3.schem');
}
