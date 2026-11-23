/**
 * Piston elevator: N sticky pistons stacked in a shaft (facing up) push a platform N blocks up. Same control idea as examples/wave-arm-fast.ts
 * (hold level wave, retract, N-1 pulse runs), but a repeater line cannot run vertically, so every line is a DIAGONAL: junction dust at the
 * height of its tap, repeater (flat), dust (flat), dust step. Each tap has its own plane y = 1 + tap; stub rows run horizontally in that plane
 * (planes of same-side taps are 2 apart, wool in between).
 * Stacked pistons see the faces of the piston above as neighbours of their "above" cell (quasi-connectivity): a pulse on tap x also pulses x-1.
 * So the runs start at taps 2N-3, 2N-5, .., 1 (all odd), each pulsing every tap above, pulses 2 rt wide (abstract model + scripted tests).
 * Faces: even piston: south = pulses E (comparator that narrows the pulse), east = hold H (repeater); odd piston: north = pulses O.
 * Run: npx tsx examples/elevator.ts [N]
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Dir, Pos } from '../src/dirs.ts';

export interface ElevOpts { wool?: boolean; delayO?: number }
type Placer = { place(p: Pos, t: string, props?: Record<string, any>): unknown };
const OPP: Record<Dir, Dir> = { east: 'west', west: 'east', north: 'south', south: 'north', up: 'down', down: 'up' };

export function buildElevator(w: Placer, n: number, o: ElevOpts = {}): { lever: Pos; tip: Pos } {
  const wool = o.wool ?? true;
  const col = (c: string) => (wool ? `${c}_wool` : 'obsidian');
  const solid = new Set<string>();
  const block = (x: number, y: number, z: number, c: string) => { const k = `${x},${y},${z}`; if (!solid.has(k)) { solid.add(k); w.place([x, y, z], col(c)); } };
  const dust = (x: number, y: number, z: number, c: string) => { block(x, y - 1, z, c); w.place([x, y, z], 'redstone_wire'); };
  const rep = (x: number, y: number, z: number, flow: Dir, delay: number, c: string) => { block(x, y - 1, z, c); w.place([x, y, z], 'repeater', { facing: OPP[flow], delay }); };
  const cmp = (x: number, y: number, z: number, flow: Dir, c: string) => { block(x, y - 1, z, c); w.place([x, y, z], 'comparator', { facing: OPP[flow], mode: 'subtract' }); };

  const top = 2 * n - 2;
  const hgt = (a: number) => 1 + a;
  const runsB: number[] = []; for (let b = 2 * n - 3; b >= 1; b -= 2) runsB.push(b);      // odd run start taps, descending
  const evenTaps: number[] = []; for (let a = 0; a <= top; a += 2) evenTaps.push(a);
  const oddTaps: number[] = []; for (let a = 1; a <= top - 1; a += 2) oddTaps.push(a);
  const Xp = (a: number) => -2 * a;                // position of tap a along the E / O line axis (x): lines run west as they rise
  const Zh = (a: number) => -2 * a;                 // H line axis (z), north only
  const BOOST = 13;                                 // dust cells between boosters (dust range is 15)
  const rowLen = (kind: 'E' | 'O' | 'H', a: number) => (kind === 'H' ? Math.abs(Zh(a)) + 3 : Math.abs(Xp(a)) + 3);
  const boosters = (kind: 'E' | 'O' | 'H', a: number) => Math.max(0, Math.ceil(rowLen(kind, a) / BOOST) - 1);
  const bMaxEO = Math.max(0, ...evenTaps.map((a) => boosters('E', a)), ...oddTaps.map((a) => boosters('O', a)));
  // ---- shaft ----
  block(0, 0, 0, 'white');
  for (let k = 0; k < n; k++) w.place([0, 1 + k, 0], 'sticky_piston', { facing: 'up' });
  w.place([0, 1 + n, 0], 'stone');

  // ---- stubs (junction -> piston face) ----
  /** E (side=+1, south) or O (side=-1, north): J at (X,y,5s) -> R1 (X,y,4s) -> [dummy boosters] -> (X,y,3s) dust -> row along z=2s towards x=0 (boosters) -> comparator fork */
  const stubEO = (a: number, side: 1 | -1, c: string) => {
    const y = hgt(a), X = Xp(a), z = (d: number) => d * side;
    const flowIn: Dir = side > 0 ? 'north' : 'south';
    rep(X, y, z(4), flowIn, 1, c);                                          // R1 diode from the junction
    const nb = boosters(side > 0 ? 'E' : 'O', a);
    for (let k = nb; k < bMaxEO; k++) {}                                    // dummy boosters handled below
    // column: (X,3) booster/dummy repeater so that every tap has the same number of repeaters
    const needDummy = bMaxEO - nb;
    if (needDummy >= 1) rep(X, y, z(3), flowIn, 1, c); else dust(X, y, z(3), c);
    dust(X, y, z(2), c);
    // row along z=2 from X to -2 (west end of the fork) passing x=0
    const x0 = Math.min(X, -2), x1 = Math.max(X, 0);
    const rowFlowEast = X < 0;
    for (let x = x0; x <= x1; x++) {
      if (x === X) continue;                                                 // (X,2) already placed
      dust(x, y, z(2), c);
    }
    // boosters in the row: replace dust cells by repeaters (flow towards the shaft) at spaced straight cells, away from the fork region
    const cells: number[] = []; for (let x = X; x !== 0; x += X < 0 ? 1 : -1) cells.push(x);
    for (let k = 1; k <= nb; k++) { const idx = Math.round((k * cells.length) / (nb + 1)); if (idx >= 1 && idx < cells.length - 1) rep(cells[idx], y, z(2), X < 0 ? 'east' : 'west', 1, c); }
    void rowFlowEast;
    // fork: branch from (-2,2) -> D3 (-2,1) -> Rs (-1,1) flow east (delay 2) -> comparator side; comparator at (0,1) rear from (0,2)
    dust(-2, y, z(1), c);
    rep(-1, y, z(1), 'east', 2, c);
    cmp(0, y, z(1), side > 0 ? 'north' : 'south', c);
  };
  /** H (east face): J at (5,y,Z) -> R1 (4,y,Z) flow west -> dust (3,y,Z),(2,y,Z) -> row along x=2 towards z=0 (boosters) -> final repeater (1,y,0) flow west */
  const stubH = (a: number, c: string) => {
    const y = hgt(a), Z = Zh(a);
    rep(4, y, Z, 'west', 1, c); dust(3, y, Z, c); dust(2, y, Z, c);
    for (let z = Z + 1; z <= 0; z++) dust(2, y, z, c);
    const nb = boosters('H', a);
    const len = -Z; for (let k = 1; k <= nb; k++) { const z = Z + Math.round((k * len) / (nb + 1)); if (z >= Z + 1 && z <= -1) rep(2, y, z, 'south', 1, c); }
    rep(1, y, 0, 'west', 1, c);
  };

  // ---- diagonal lines ----
  type Dst = (u: number, y: number) => [number, number, number];
  const diag = (taps: number[], uOf: (a: number) => number, dir: 1 | -1, flow: Dir, dst: Dst, delays: number[], c: string) => {
    taps.forEach((a, i) => {
      const u = uOf(a), y = hgt(a);
      let p = dst(u, y); dust(p[0], p[1], p[2], c);
      if (i < taps.length - 1) {
        const sgn = taps[i + 1] > a ? 1 : -1;
        p = dst(u + dir, y); rep(p[0], p[1], p[2], flow, delays[i], c);
        p = dst(u + 2 * dir, y); dust(p[0], p[1], p[2], c);
        p = dst(u + 3 * dir, y + sgn); dust(p[0], p[1], p[2], c);
      }
    });
  };
  const hopFor = (kind: 'E' | 'O' | 'H', taps: number[], base: number) => taps.slice(0, -1).map((a, i) => Math.max(1, base - (boosters(kind, taps[i + 1]) - boosters(kind, a))));
  diag(evenTaps, Xp, -1, 'west', (u, y) => [u, y, 5], evenTaps.slice(1).map(() => 4), 'lime');           // E / O stubs all have the same number of repeaters (dummies), no hop correction
  diag(oddTaps, Xp, -1, 'west', (u, y) => [u, y, -5], oddTaps.slice(1).map(() => 4), 'light_blue');
  diag(evenTaps, Zh, -1, 'north', (u, y) => [5, y, u], hopFor('H', evenTaps, 2), 'green');
  for (const a of evenTaps) { stubEO(a, 1, 'magenta'); stubH(a, 'green'); }
  for (const a of oddTaps) stubEO(a, -1, 'magenta');
  // ---- timelines (flow east/down), injection stubs ----
  const eInj: number[] = runsB.map((b) => b + 1), oInj = runsB;                // E / O injection taps, descending
  const dirTL: 1 = 1;
  const tlE = diag(eInj, Xp, dirTL, 'east', (u, y) => [u, y, 8], eInj.slice(1).map(() => 4), 'yellow');
  const tlO = diag(oInj, Xp, dirTL, 'east', (u, y) => [u, y, -8], oInj.slice(1).map(() => 4), 'yellow');
  void tlE; void tlO;
  for (const a of eInj) { dust(Xp(a), hgt(a), 7, 'yellow'); rep(Xp(a), hgt(a), 6, 'north', 1, 'yellow'); }
  for (const a of oInj) { dust(Xp(a), hgt(a), -7, 'yellow'); rep(Xp(a), hgt(a), -6, 'south', 1, 'yellow'); }

  // ---- lever (base, east of the shaft), hold feed, master pulse ----
  block(9, 1, 0, 'purple');
  const lever: Pos = [8, 1, 0]; w.place(lever, 'lever', { face: 'wall', facing: 'west' });
  dust(7, 1, 0, 'green'); dust(6, 1, 0, 'green');
  dust(8, 1, 1, 'purple'); rep(8, 1, 2, 'south', 3, 'purple'); cmp(8, 1, 3, 'south', 'purple');
  dust(9, 1, 1, 'purple'); dust(10, 1, 1, 'purple'); dust(10, 1, 2, 'purple'); dust(10, 1, 3, 'purple'); rep(9, 1, 3, 'west', 1, 'purple');
  dust(8, 1, 4, 'orange');

  // ---- feeder: master -> south along x=8 to z=12 -> west along z=12 -> torch tower at xT -> split to the two timelines ----
  type C3 = [number, number, number];
  const dirOf = (a: C3, b: C3): string => `${Math.sign(b[0] - a[0])},${Math.sign(b[1] - a[1])},${Math.sign(b[2] - a[2])}`;
  const layPath = (cells: C3[], total: number, c: string, what: string, prev: C3) => {
    const at = (i: number): C3 => (i < 0 ? prev : cells[i]);
    const flatDir = (i: number) => { const a = at(i - 1), b = cells[i]; return a[1] === b[1] ? dirOf(a, b) : ''; };
    const straight = cells.map((q, i) => i < cells.length - 1 && cells[i + 1][1] === q[1] && at(i - 1)[1] === q[1] && flatDir(i) === dirOf(q, cells[i + 1]) && flatDir(i) !== '');
    const k = Math.max(Math.ceil(total / 4), Math.floor(cells.length / 12));
    if (k > total) throw new Error(`${what}: ${k} repeaters need at least ${k} rt but total is ${total}`);
    const idx: number[] = [];
    const ok: number[] = straight.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (ok.length < k) throw new Error(`${what}: only ${ok.length} straight cells for ${k} repeaters`);
    for (let j = 0; j < k; j++) idx.push(ok[Math.min(ok.length - 1, Math.floor(((j + 0.5) * ok.length) / k))]);
    const d = idx.map((_, j) => Math.floor(total / k) + (j < total % k ? 1 : 0));
    cells.forEach((q, i) => {
      const j = idx.indexOf(i);
      if (j >= 0) { const a = at(i - 1); const dx = q[0] - a[0], dz = q[2] - a[2]; rep(q[0], q[1], q[2], dx > 0 ? 'east' : dx < 0 ? 'west' : dz > 0 ? 'south' : 'north', d[j], c); }
      else dust(q[0], q[1], q[2], c);
    });
  };
  const seg = (a: C3, b: C3): C3[] => { const out: C3[] = []; const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]), dz = Math.sign(b[2] - a[2]); for (let p: C3 = [a[0], a[1], a[2]]; ; p = [p[0] + dx, p[1] + dy, p[2] + dz]) { out.push([p[0], p[1], p[2]]); if (p[0] === b[0] && p[1] === b[1] && p[2] === b[2]) break; } return out; };
  const xT = -4 * n - 8, zF = 12;
  const yO = hgt(2 * n - 3), yE = hgt(2 * n - 2);
  const Lt = 1 + 4 * Math.round((yE - 1) / 4);                            // torch tower top level (true signal at 1, 5, 9, ...), nearest to the timeline heights
  const torches = (Lt - 1) / 2;
  const delayO = o.delayO ?? 3 * n + 10;                    // sim window: N=4..7 work from 16 up to 40+
  const oLegCells: C3[] = [];
  // O leg: from the split (xT, Lt, 8) north along x=xT to z=-8, then east along z=-8 to the O timeline input, stepping up Lt -> yO on the way
  const legZ: C3[] = seg([xT, Lt, 7], [xT, Lt, -8]);
  const upO = (x0: number, z: number, y0: number, y1: number, x1: number): C3[] => { const out: C3[] = []; let y = y0, x = x0; for (; x <= x1; x++) { out.push([x, y, z]); if (y < y1 && x - x0 >= 3 && (x - x0) % 3 === 0) y++; } return out; };
  void upO;
  const oEast: C3[] = []; { let y = Lt; for (let x = xT + 1; x <= -4 * n + 5; x++) { if (y !== yO && x - xT >= 3 && (x - xT) % 3 === 0) y += Math.sign(yO - y); oEast.push([x, y, -8]); } if (y !== yO) throw new Error('O feed does not reach the timeline height'); }
  const eEast: C3[] = []; { let y = Lt; for (let x = xT + 1; x <= -4 * n + 3; x++) { if (y !== yE && x - xT >= 3 && (x - xT) % 3 === 0) y += Math.sign(yE - y); eEast.push([x, y, 8]); } if (y !== yE) throw new Error('E feed does not reach the timeline height'); }
  const oLeg: C3[] = [...legZ, ...oEast];
  const oLegDelay = Math.max(2, Math.ceil(oLeg.length / 12));
  const eLegDelay = oLegDelay + 2;
  // feeder along the base plane: (8,1,5..11) south, (8,1,12) corner, west along z=12 to xT+1, base block of the tower at (xT,1,12)
  const feeder: C3[] = [...seg([8, 1, 5], [8, 1, zF]).slice(0), ...seg([7, 1, zF], [xT + 1, 1, zF])];
  const feederDelay = delayO - torches - oLegDelay - 1;
  if (feederDelay < Math.ceil(feeder.length / 12)) throw new Error(`delayO ${delayO} too small for this feeder (${feeder.length} cells, ${torches} torches)`);
  layPath(feeder, feederDelay, 'orange', 'feeder', [8, 1, 4]);
  // torch tower at (xT, y, 12): base block (powered by the dust pointing at it), torch, block, ... up to Lt
  block(xT, 0, zF, 'cyan');
  w.place([xT, 1, zF], col('cyan'));
  for (let y = 2; y <= Lt; y++) { if ((y - 1) % 2 === 1) w.place([xT, y, zF], 'redstone_torch', { lit: ((y - 1) / 1) % 4 === 1 }); else w.place([xT, y, zF], col('cyan')); }
  // prefix from the top: (xT, Lt, 11) .. (xT, Lt, 8)
  for (let z = zF - 1; z >= 8; z--) dust(xT, Lt, z, 'orange');
  // legs (dust cell (xT,Lt,8) already placed above is the split)
  layPath(oLeg.slice(1), oLegDelay, 'orange', 'O leg', oLeg[0]); dust(oLeg[0][0], oLeg[0][1], oLeg[0][2], 'orange');
  layPath(eEast, eLegDelay, 'orange', 'E leg', [xT, Lt, 8]);
  return { lever, tip: [0, 1 + n, 0] };
}

export const elevTop = (w: World, n: number): number | null => { for (let y = 0; y <= 4 * n; y++) if (w.get([0, y, 0]).type === 'stone') return y; return null; };
export const elevHome = (w: World, n: number): boolean =>
  elevTop(w, n) === 1 + n && Array.from({ length: n }, (_, k) => k).every((k) => w.get([0, 1 + k, 0]).type === 'sticky_piston' && !w.read([0, 1 + k, 0], 'extended'));

if (process.argv[1]?.endsWith('elevator.ts')) {
  const n = Number(process.argv[2] ?? 6);
  const w = new World(); const { lever } = buildElevator(w, n);
  const bl = w.listBlocks(); const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const b of bl) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b.pos[i]); mx[i] = Math.max(mx[i], b.pos[i]); }
  console.log(`N=${n}: ${bl.length} blocks, size ${mx.map((v, i) => v - mn[i] + 1).join('x')}`);
  w.run(500);
  console.log('rest: home', elevHome(w, n));
  w.use(lever); let t = 0; while (t < 2000 && elevTop(w, n) !== 1 + 2 * n) { w.run(1); t++; }
  console.log('lever ON: platform at height', elevTop(w, n), `(want ${1 + 2 * n}) after ${(t / 20).toFixed(2)} s`);
  w.run(60); w.use(lever); let t2 = 0; while (t2 < 3000 && !elevHome(w, n)) { w.run(1); t2++; }
  console.log('lever OFF: home', elevHome(w, n), `after ${(t2 / 20).toFixed(2)} s`);
  const f = new World(); buildElevator(f, n); f.run(500);
  writeFileSync(`examples/elevator-${n}.schem`, exportSchem(f).buffer);
  console.log(`wrote examples/elevator-${n}.schem`);
}
