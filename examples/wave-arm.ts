/**
 * Compact N-stage piston extender controlled by WAVES instead of one delay row per pulse. Run: npx tsx examples/wave-arm.ts [N]
 *
 * Mechanics (found with the abstract model + scripted pulses, all in the simulator):
 *  - Extension: a level wave travels east along the EVEN taps (P_k at tap x=2(k-1)), one stage per `hold` rt.
 *  - Retraction: the same level falls in the same order (P1 first); that leaves  P.P.P. ... P T  (pistons at 0,2,4.. , tip 2N-1).
 *    Releasing everything at once gives the same state.
 *  - Closing the gaps takes N-1 "runs". Run j starts at tap b_j = 2N-5, 2N-7, ..., 1, then 0, and pulses EVERY tap b, b+1, b+2, ... up to
 *    the end, 2 rt apart (a piston at x with x+1 free and a block at x+2 pulls it to x+1; elsewhere the pulse does nothing). Runs are 4 rt apart.
 *    Because a run ends at the end of the arm, a wave line needs no gating.
 *  - Taps alternate sides: even taps are driven from the south (line E, also carries the hold level), odd taps from the north (line O).
 *    Each line is  junction dust / repeater(4 rt) / junction ...  (2 cells = 2 taps = 4 rt), with a diode stub (dust + repeater) into each piston.
 *    Runs are injected into a line at the right junction by a timeline (same hop) through diode stubs.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Dir, Pos } from '../src/dirs.ts';
import { opposite } from '../src/dirs.ts';

export interface WaveOpts { hold?: number; width?: number; delayO?: number; delayE?: number; wool?: boolean }
const STEP: Record<string, [number, number]> = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] };

export function buildWaveArm(w: { place(p: Pos, t: string, props?: Record<string, any>): unknown }, n: number, o: WaveOpts = {}): { lever: Pos; tip: Pos } {
  const wool = o.wool ?? true;
  const floor = new Set<string>();
  const col = (c: string) => (wool ? `${c}_wool` : 'obsidian');
  const under = (x: number, z: number, c: string) => { const k = `${x},${z}`; if (!floor.has(k)) { floor.add(k); w.place([x, 0, z], col(c)); } };
  const dust = (x: number, z: number, c: string) => { under(x, z, c); w.place([x, 1, z], 'redstone_wire'); };
  /** repeater: flow = direction the signal travels; facing is the INPUT side */
  const rep = (x: number, z: number, flow: Dir, delay: number, c: string) => { under(x, z, c); w.place([x, 1, z], 'repeater', { facing: opposite(flow), delay }); };
  const cmp = (x: number, z: number, flow: Dir, c: string) => { under(x, z, c); w.place([x, 1, z], 'comparator', { facing: opposite(flow), mode: 'subtract' }); };

  const top = 2 * n - 2;                       // highest tap that can hold a piston
  const runs: number[] = []; for (let b = 2 * n - 5; b >= 1; b -= 2) runs.push(b); runs.push(0);
  const HOLD = o.hold ?? 4;                    // hold hop is the line hop: 4 rt per 2 cells (a single repeater at most 4)
  void HOLD;
  const ZE = 3, ZO = -3, ZTE = 6, ZTO = -6;    // lines and timelines
  const xFeed = -2;

  // ---- arm ----
  for (let x = 0; x < n; x++) w.place([x, 1, 0], 'sticky_piston', { facing: 'east' });
  w.place([n, 1, 0], 'stone');
  for (let x = 0; x <= top + 1; x++) under(x, 0, 'white');

  // ---- lines E (south, even taps) and O (north, odd taps) flowing east ----
  const stubE = (x: number) => { dust(x, ZE - 1, 'magenta'); rep(x, ZE - 2, 'north', 1, 'magenta'); };
  const stubO = (x: number) => { dust(x, ZO + 1, 'magenta'); rep(x, ZO + 2, 'south', 1, 'magenta'); };
  for (let e = 0; e <= top; e += 2) { dust(e, ZE, 'lime'); stubE(e); if (e < top) rep(e + 1, ZE, 'east', 4, 'lime'); }
  for (let q = 1; q <= top - 1; q += 2) { dust(q, ZO, 'light_blue'); stubO(q); if (q < top - 1) rep(q + 1, ZO, 'east', 4, 'light_blue'); }
  // extra junction west of tap 1 for the last run (b = 0): J'(-1) -> repeater(0) -> J(1)
  dust(-1, ZO, 'light_blue'); rep(0, ZO, 'east', 4, 'light_blue');

  // ---- timelines flowing west; junction columns carry a diode stub into the line ----
  const injO = (x: number) => { dust(x, ZTO + 1, 'yellow'); rep(x, ZTO + 2, 'south', 1, 'yellow'); };   // timeline (x,ZTO) -> line junction (x,ZO)
  const injE = (x: number) => { dust(x, ZTE - 1, 'yellow'); rep(x, ZTE - 2, 'north', 1, 'yellow'); };
  const oCols: number[] = []; for (let q = top - 1; q >= -1; q -= 2) oCols.push(q);   // 15,13,..,1,-1 (N=10)
  const eCols: number[] = []; for (let e = top; e >= 0; e -= 2) eCols.push(e);
  // timeline O: starts at the east end
  const xO0 = oCols[0], xE0 = eCols[0];
  for (const x of oCols) { dust(x, ZTO, 'yellow'); injO(x); }
  for (let q = oCols[0] - 1; q > -1; q -= 2) rep(q, ZTO, 'west', 4, 'yellow');
  for (const x of eCols) { dust(x, ZTE, 'yellow'); injE(x); }
  for (let e = eCols[0] - 1; e > 0; e -= 2) rep(e, ZTE, 'west', 4, 'yellow');
  void xO0; void xE0;

  // ---- lever, hold feed and master pulse ----
  const LX = -6;
  under(LX - 1, 0, 'purple'); w.place([LX - 1, 1, 0], col('purple')); // support of the lever
  const lever: Pos = [LX, 1, 0]; w.place(lever, 'lever', { face: 'wall', facing: 'east' });
  // hold feed: south of the lever, then east along z=ZE to a diode into junction 0
  for (let z = 1; z <= ZE; z++) dust(LX, z, 'lime');
  for (let x = LX + 1; x <= xFeed; x++) dust(x, ZE, 'lime');
  rep(-1, ZE, 'east', 1, 'lime');
  // master pulse north of the lever: A, delayed rear, side
  dust(LX, -1, 'purple'); rep(LX, -2, 'north', o.width ?? 3, 'purple'); cmp(LX, -3, 'north', 'purple');
  dust(LX + 1, -1, 'purple'); dust(LX + 2, -1, 'purple'); dust(LX + 2, -2, 'purple'); dust(LX + 2, -3, 'purple'); rep(LX + 1, -3, 'west', 1, 'purple');
  dust(LX, -4, 'orange');

  // ---- feeders: master pulse -> split -> O timeline (short tail) and E timeline (long tail, 2 rt later) ----
  type XZ = [number, number];
  const line = (a: XZ, b: XZ): XZ[] => { const out: XZ[] = []; const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]); for (let p: XZ = [a[0], a[1]]; ; p = [p[0] + dx, p[1] + dz]) { out.push([p[0], p[1]]); if (p[0] === b[0] && p[1] === b[1]) break; } return out; };
  const flowDir = (a: XZ, b: XZ): Dir => (b[0] > a[0] ? 'east' : b[0] < a[0] ? 'west' : b[1] > a[1] ? 'south' : 'north');
  /** dust path with exactly `total` rt of delay (repeaters on straight cells, at least one per 12 cells) */
  const layPath = (cells: XZ[], total: number, c: string, what: string, prev: XZ) => {
    const at = (i: number): XZ => (i < 0 ? prev : cells[i]);
    const straight = cells.map((q, i) => i < cells.length - 1 && flowDir(at(i - 1), q) === flowDir(q, cells[i + 1]));
    const k = Math.max(Math.ceil(total / 4), Math.floor(cells.length / 12));
    if (k > total) throw new Error(`${what}: ${k} repeaters need at least ${k} rt but total is ${total}`);
    const idx: number[] = [];
    for (let j = 0; j < k; j++) { let i = Math.round(((j + 0.5) * cells.length) / k); while (i < cells.length && !straight[i]) i++; if (i >= cells.length) { i = Math.round(((j + 0.5) * cells.length) / k); while (i >= 0 && !straight[i]) i--; } if (i < 0 || idx.includes(i)) throw new Error(`${what}: no room for repeater ${j}`); idx.push(i); }
    idx.sort((a, b) => a - b);
    const d = idx.map((_, j) => Math.floor(total / k) + (j < total % k ? 1 : 0));
    cells.forEach((q, i) => { const j = idx.indexOf(i); if (j >= 0) rep(q[0], q[1], flowDir(at(i - 1), q), d[j], c); else dust(q[0], q[1], c); });
  };
  const xSplit = top, xEast = 2 * n + 2, xEs = top + 1;
  const eTail: XZ[] = [...line([xSplit + 1, -8], [xEast, -8]).slice(0), ...line([xEast, -7], [xEast, ZTE + 2]), ...line([xEast - 1, ZTE + 2], [xEs, ZTE + 2]), ...line([xEs, ZTE + 1], [xEs, ZTE])];
  const eRep = Math.max(1, Math.floor(eTail.length / 12), 3);
  const eDelay = eRep;                        // each repeater delay 1
  const oTailDelay = eDelay - 2;
  const oTail: XZ[] = line([xSplit, -7], [xSplit, ZTO]);
  const delayO = o.delayO ?? 4 * n;           // window found in the sim: N=10 works from 28 to 48+, N=12 from about 44, N=5 from 20
  const trunk: XZ[] = [...line([LX, -5], [LX, -8]), ...line([LX + 1, -8], [xSplit - 1, -8])];
  dust(xSplit, -8, 'orange');
  layPath(trunk, delayO - oTailDelay, 'orange', 'trunk', [LX, -4]);
  layPath(oTail, oTailDelay, 'orange', 'O tail', [xSplit, -8]);
  layPath(eTail, eDelay, 'orange', 'E tail', [xSplit, -8]);
  return { lever, tip: [n, 1, 0] };
}

export const waveTipX = (w: World, n: number): number | null => { for (let x = -1; x <= 3 * n + 2; x++) if (w.get([x, 1, 0]).type === 'stone') return x; return null; };
export const waveHome = (w: World, n: number): boolean =>
  waveTipX(w, n) === n && Array.from({ length: n }, (_, x) => x).every((x) => w.get([x, 1, 0]).type === 'sticky_piston' && !w.read([x, 1, 0], 'extended'));

if (process.argv[1]?.endsWith('wave-arm.ts')) {
  const n = Number(process.argv[2] ?? 10);
  const w = new World(); const { lever } = buildWaveArm(w, n);
  const bl = w.listBlocks(); const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const b of bl) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b.pos[i]); mx[i] = Math.max(mx[i], b.pos[i]); }
  console.log(`N=${n}: ${bl.length} blocks, size ${mx.map((v, i) => v - mn[i] + 1).join('x')}`);
  w.run(400);
  console.log('rest: home', waveHome(w, n));
  w.use(lever); w.run(600); console.log('lever ON: tip at', waveTipX(w, n), '(want', 2 * n + ')');
  w.use(lever); let t = 0; while (t < 2000 && !waveHome(w, n)) { w.run(2); t += 2; }
  console.log('lever OFF: home', waveHome(w, n), `after ${(t / 20).toFixed(1)} s`);
  const f = new World(); buildWaveArm(f, n); f.run(400);
  writeFileSync(`examples/extender-${n}-wave.schem`, exportSchem(f).buffer);
  console.log(`wrote examples/extender-${n}-wave.schem`);
}
