/**
 * Generic flat N-stage piston extender (N sticky pistons in a row along +x at y=0,z=0; tip stone at x=N; travels N blocks).
 * Same controller idea as flat-arm3.ts, but data driven: every piston tap (stone beside the arm + dust on top, even x
 * on the north side, odd x on the south side) is the OR of any number of sources:
 *   - chain  : the lever signal delayed by `abs` rt (repeater chain)
 *   - pulse  : subtract comparator (rear edge - side edge), clean 15 pulse, both inputs straight from repeaters
 * One trunk (dust + repeater every 8 cells) carries the lever; each chain is shortened by the trunk delay at its branch
 * so every waveform shares the time base K + abs. Lanes (dust columns to the taps) are 2 apart; shallow lanes spread
 * outward (west/east), deeper lanes sit further out, the middle lane is the deepest and takes rows from both sides.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Dir, Pos } from '../src/dirs.ts';
import { opposite } from '../src/dirs.ts';

export interface Hold { x: number; on: number; off: number }
export interface Pulse { x: number; side: number; rear: number }
export interface ArmSpec { n: number; K: number; holds: Hold[]; pulses: Pulse[]; xw: number; xe: number }

/** Mechanical sequence found with scripted power (see knowledge/LEARNINGS.md): 4 stages. */
export const QUAD: ArmSpec = {
  n: 4, K: 12, xw: -20, xe: 26,
  holds: [
    { x: 0, on: 0, off: 19 }, { x: 2, on: 3, off: 15 }, { x: 4, on: 6, off: 12 }, { x: 6, on: 9, off: 9 },
  ],
  pulses: [
    { x: 5, side: 16, rear: 19 }, { x: 3, side: 20, rear: 23 }, { x: 4, side: 24, rear: 27 },
    { x: 1, side: 28, rear: 31 }, { x: 2, side: 32, rear: 35 }, { x: 3, side: 36, rear: 39 },
  ],
};

type XZ = [number, number];
const dirOf = (a: XZ, b: XZ): Dir => (b[0] > a[0] ? 'east' : b[0] < a[0] ? 'west' : b[1] > a[1] ? 'south' : 'north');
const line = (a: XZ, b: XZ): XZ[] => {
  const out: XZ[] = [];
  const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
  for (let p: XZ = [a[0], a[1]]; ; p = [p[0] + dx, p[1] + dz]) { out.push([p[0], p[1]]); if (p[0] === b[0] && p[1] === b[1]) break; }
  return out;
};

interface Src { kind: 'chain' | 'pulse'; abs: number; side?: number; dx: number; z: number; }
interface Lane { x: number; s: number; srcs: Src[]; deep: number }

export function buildFlatArm(w: World, spec: ArmSpec): { lever: Pos; tip: Pos } {
  const { K, xw, xe } = spec;
  // ---------- plan ----------
  const lanes: Lane[] = [];
  for (let x = 0; x < 2 * spec.n - 1 + 1; x++) {
    const srcs: Src[] = [];
    for (const h of spec.holds) if (h.x === x) { srcs.push({ kind: 'chain', abs: h.on, dx: 0, z: 0 }); if (h.off !== h.on) srcs.push({ kind: 'chain', abs: h.off, dx: 0, z: 0 }); }
    for (const p of spec.pulses) if (p.x === x) srcs.push({ kind: 'pulse', abs: p.rear, side: p.side, dx: 0, z: 0 });
    if (srcs.length) lanes.push({ x, s: x % 2 === 0 ? -1 : 1, srcs, deep: 0 });
  }
  let zTop = 0, zBot = 0;
  for (const s of [-1, 1]) {
    const L = lanes.filter((l) => l.s === s).sort((a, b) => a.x - b.x);
    const half = Math.floor(L.length / 2);
    const west = L.slice(0, half), east = L.slice(L.length - half).reverse(), mid = L.length % 2 ? L[half] : null;
    let curW = 2, curE = 2;
    const alloc = (lane: Lane, dxs: number[], cur: number): number => {
      lane.srcs.forEach((src, i) => {
        src.dx = dxs[i % dxs.length]; src.z = s * cur;
        cur += src.kind === 'pulse' ? 4 : 2;
        lane.deep = Math.max(lane.deep, Math.abs(src.z) + (src.kind === 'pulse' ? 2 : 0));
      });
      return cur;
    };
    for (const l of west) curW = alloc(l, [1], curW);
    for (const l of east) curE = alloc(l, [-1], curE);
    if (mid) alloc(mid, [1, -1], Math.max(curW, curE));
    const deepest = Math.max(0, ...L.map((l) => l.deep));
    if (s < 0) zTop = -(deepest + 3); else zBot = deepest + 3;
  }

  // ---------- placement helpers ----------
  const floor = new Set<string>();
  const under = (x: number, z: number) => { const k = `${x},${z}`; if (!floor.has(k)) { floor.add(k); w.place([x, 0, z], 'obsidian'); } };
  const dust = (x: number, z: number) => { under(x, z); w.place([x, 1, z], 'redstone_wire'); };
  const rep = (x: number, z: number, out: Dir, delay: number) => { under(x, z); w.place([x, 1, z], 'repeater', { facing: opposite(out), delay }); };
  const cmp = (x: number, z: number, out: Dir) => { under(x, z); w.place([x, 1, z], 'comparator', { facing: opposite(out), mode: 'subtract' }); };

  // ---------- arm + taps ----------
  for (let x = 0; x < spec.n; x++) w.place([x, 0, 0], 'sticky_piston', { facing: 'east' });
  w.place([spec.n, 0, 0], 'stone');
  for (const l of lanes) { floor.add(`${l.x},${l.s}`); w.place([l.x, 0, l.s], 'stone'); }

  // ---------- trunk ----------
  const xc = Math.floor((xw + xe) / 2);
  const attach = new Set<string>();
  const rowZ = (l: Lane, src: Src): number[] => (src.kind === 'pulse' ? [src.z, src.z + 2 * l.s] : [src.z]);
  for (const l of lanes) for (const src of l.srcs) for (const z of rowZ(l, src)) attach.add(`${src.dx > 0 ? xw : xe},${z}`);
  attach.add(`${xc},${zTop}`);
  const trunkDelay = new Map<string, number>();
  const lay = (path: XZ[]) => {
    let count = 0, since = 0;
    path.forEach((c, i) => {
      const key = `${c[0]},${c[1]}`;
      trunkDelay.set(key, count);
      const prev = path[i - 1], next = path[i + 1];
      since++;
      if (since >= 8 && prev && next && dirOf(prev, c) === dirOf(c, next) && !attach.has(key)) { rep(c[0], c[1], dirOf(c, next), 1); count++; since = 0; }
      else dust(c[0], c[1]);
    });
  };
  lay([...line([xc, zTop], [xw, zTop]), ...line([xw, zTop + 1], [xw, zBot])]);
  lay([...line([xc, zTop], [xe, zTop]), ...line([xe, zTop + 1], [xe, zBot])]);
  floor.add(`${xc},${zTop - 1}`); w.place([xc, 0, zTop - 1], 'obsidian');
  w.place([xc, 1, zTop - 1], 'lever', { face: 'floor' });
  const td = (x: number, z: number) => trunkDelay.get(`${x},${z}`) ?? 0;

  // ---------- sources ----------
  /** repeater/dust row: `cells` in flow order, ending into `into`. repeaters at the end when `tail` is false (comparator inputs) */
  const row = (cells: XZ[], D: number, outLast: Dir, repeatersLast: boolean, what: string) => {
    if (D < 1) throw new Error(`${what}: delay ${D} < 1 (raise K)`);
    const n = Math.min(cells.length, D);
    if (D > 4 * n) throw new Error(`${what}: delay ${D} does not fit ${cells.length} cells (widen xw/xe)`);
    const d = Array.from({ length: n }, (_, i) => Math.floor(D / n) + (i < D % n ? 1 : 0));
    cells.forEach((c, i) => {
      const k = repeatersLast ? i - (cells.length - n) : i;
      if (k < 0 || k >= n) { dust(c[0], c[1]); return; }
      rep(c[0], c[1], i + 1 < cells.length ? dirOf(c, cells[i + 1]) : outLast, d[k]);
    });
  };
  for (const l of lanes) {
    const farthest = Math.max(...l.srcs.map((s) => Math.abs(s.z)));
    for (let z = 1; z <= farthest; z++) dust(l.x, l.s * z);
    for (const src of l.srcs) {
      const dx = src.dx, X = dx > 0 ? xw : xe, z = src.z, o = l.s; // o: outward step in z
      const first = X + dx;
      if (src.kind === 'chain') {
        const cells = line([first, z], [l.x - dx, z]);
        row(cells, K + src.abs - td(X, z), dx > 0 ? 'east' : 'west', false, `chain x${l.x} abs${src.abs}`);
      } else {
        const cx = l.x - 2 * dx;
        dust(l.x - dx, z);
        cmp(cx, z, dx > 0 ? 'east' : 'west');
        const rearCells = line([first, z], [l.x - 3 * dx, z]);
        row(rearCells, K + src.abs - td(X, z), dx > 0 ? 'east' : 'west', true, `pulse x${l.x} rear${src.abs}`);
        const zs = z + 2 * o;
        dust(cx, zs);
        rep(cx, z + o, o > 0 ? 'north' : 'south', 1); // side repeater: between the side dust and the comparator
        const sideCells = line([first, zs], [l.x - 3 * dx, zs]);
        row(sideCells, K + src.side! - td(X, zs) - 1, dx > 0 ? 'east' : 'west', true, `pulse x${l.x} side${src.side}`);
      }
    }
  }
  return { lever: [xc, 1, zTop - 1], tip: [spec.n, 0, 0] };
}

export const tipXN = (w: World, n: number): number | null => {
  for (let x = -1; x <= 3 * n + 2; x++) if (w.get([x, 0, 0]).type === 'stone') return x;
  return null;
};
export const homeN = (w: World, n: number): boolean =>
  tipXN(w, n) === n && Array.from({ length: n }, (_, x) => x).every((x) => w.get([x, 0, 0]).type === 'sticky_piston' && !w.read([x, 0, 0], 'extended'));

if (process.argv[1]?.endsWith('flat-armN.ts')) {
  const w = new World();
  buildFlatArm(w, QUAD);
  w.run(300);
  writeFileSync('examples/flat-arm4.schem', exportSchem(w).buffer);
  console.log('wrote examples/flat-arm4.schem');
}
