/**
 * Faster wave-controlled extender (see wave-arm.ts for the idea). The hold level gets its OWN line H (hop 2 rt instead of 4), so the
 * extension takes half as long and the retraction ripple is half as long, which lets the gap-closing runs start earlier.
 *   side "H" (south, z>0):  H row (d=2) -> repeater into every even piston;  O row (d=5, odd-tap pulses) reaches the odd pistons over a
 *                           small bridge that crosses the H row (dust staircase over the H repeater, ends on a tap block).
 *   side "E" (north, z<0):  E row (d=3, even-tap pulses) -> stub -> even piston (both faces of an even piston are used).
 * Run: npx tsx examples/wave-arm-fast.ts [N]
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Dir, Pos } from '../src/dirs.ts';
import { opposite } from '../src/dirs.ts';

export interface FastOpts { delayO?: number; width?: number; wool?: boolean }
type XZ = [number, number];
const SE = -1, SH = 1; // E pulses on the north (z<0), hold + odd pulses on the south (z>0)

export function buildWaveArmFast(w: { place(p: Pos, t: string, props?: Record<string, any>): unknown }, n: number, o: FastOpts = {}): { lever: Pos; tip: Pos } {
  const wool = o.wool ?? true;
  const col = (c: string) => (wool ? `${c}_wool` : 'obsidian');
  const floor = new Set<string>();
  const under = (x: number, z: number, c: string, y = 0) => { const k = `${x},${y},${z}`; if (!floor.has(k)) { floor.add(k); w.place([x, y, z], col(c)); } };
  const dust = (x: number, z: number, c: string) => { under(x, z, c); w.place([x, 1, z], 'redstone_wire'); };
  const rep = (x: number, z: number, flow: Dir, delay: number, c: string) => { under(x, z, c); w.place([x, 1, z], 'repeater', { facing: opposite(flow), delay }); };
  const cmp = (x: number, z: number, flow: Dir, c: string) => { under(x, z, c); w.place([x, 1, z], 'comparator', { facing: opposite(flow), mode: 'subtract' }); };
  const toArm = (s: number): Dir => (s < 0 ? 'south' : 'north');       // flow direction from outside towards the arm
  const away = (s: number): Dir => (s < 0 ? 'north' : 'south');

  const top = 2 * n - 2;
  // arm
  for (let x = 0; x < n; x++) w.place([x, 1, 0], 'sticky_piston', { facing: 'east' });
  w.place([n, 1, 0], 'stone');
  for (let x = 0; x <= top + 1; x++) under(x, 0, 'white');

  // ---- side E (north): row d=3 flowing east, stubs, timeline d=6 ----
  const zE = 3 * SE, zTE = 6 * SE;
  for (let e = 0; e <= top; e += 2) {
    dust(e, zE, 'lime'); dust(e, 2 * SE, 'magenta'); rep(e, 1 * SE, toArm(SE), 1, 'magenta');
    if (e < top) rep(e + 1, zE, 'east', 4, 'lime');
  }
  // ---- side H (south): hold row d=2, hold stubs; odd-pulse row d=5 with bridges; timeline d=8 ----
  const zH = 2 * SH, zO = 5 * SH, zTO = 8 * SH;
  for (let e = 0; e <= top; e += 2) { dust(e, zH, 'green'); rep(e, 1 * SH, toArm(SH), 1, 'green'); if (e < top) rep(e + 1, zH, 'east', 2, 'green'); }
  for (let q = 1; q <= top - 1; q += 2) {
    dust(q, zO, 'light_blue'); if (q < top - 1) rep(q + 1, zO, 'east', 4, 'light_blue');
    // bridge: J_O(y1,d5) -> D1(y2,d4) on wool -> D2(y2,d3) on wool -> D3(y3,d2) on wool above the hold repeater -> D4(y2,d1) on the tap block
    const dd = (d: number) => d * SH;
    under(q, dd(4), 'cyan', 1); w.place([q, 1, dd(4)], col('cyan')); w.place([q, 2, dd(4)], 'redstone_wire');
    w.place([q, 1, dd(3)], col('cyan')); w.place([q, 2, dd(3)], 'redstone_wire');
    w.place([q, 2, dd(2)], col('cyan')); w.place([q, 3, dd(2)], 'redstone_wire');
    w.place([q, 1, dd(1)], col('red')); w.place([q, 2, dd(1)], 'redstone_wire');
  }
  // the hold row passes under the bridge at odd columns: those cells are repeaters (placed above); extra junction for the last run
  dust(-1, zO, 'light_blue'); rep(0, zO, 'east', 4, 'light_blue');

  // ---- timelines flowing west with diode stubs into the rows ----
  const eCols: number[] = []; for (let e = 2 * n - 4; e >= 0; e -= 2) eCols.push(e);       // run b (odd) starts the E line at b+1, the last run (b=0) at 0
  const oCols: number[] = []; for (let q = 2 * n - 5; q >= -1; q -= 2) oCols.push(q);   // run b starts the O line at b; -1 is the extra junction for the last run
  for (const x of eCols) { dust(x, zTE, 'yellow'); dust(x, 5 * SE, 'yellow'); rep(x, 4 * SE, toArm(SE), 1, 'yellow'); }
  for (let e = eCols[0] - 1; e > 0; e -= 2) rep(e, zTE, 'west', 4, 'yellow');
  for (const x of oCols) { dust(x, zTO, 'yellow'); dust(x, 7 * SH, 'yellow'); rep(x, 6 * SH, toArm(SH), 1, 'yellow'); }
  for (let q = oCols[0] - 1; q > -1; q -= 2) rep(q, zTO, 'west', 4, 'yellow');

  // ---- lever: hold feed to the H row (south), master pulse to the north ----
  const LX = -6;
  under(LX - 1, 0, 'purple'); w.place([LX - 1, 1, 0], col('purple'));
  const lever: Pos = [LX, 1, 0]; w.place(lever, 'lever', { face: 'wall', facing: 'east' });
  for (let z = 1; z <= zH; z++) dust(LX, z, 'green');
  for (let x = LX + 1; x <= -2; x++) dust(x, zH, 'green');
  rep(-1, zH, 'east', 1, 'green');
  dust(LX, -1, 'purple'); rep(LX, -2, 'north', o.width ?? 3, 'purple'); cmp(LX, -3, 'north', 'purple');
  dust(LX + 1, -1, 'purple'); dust(LX + 2, -1, 'purple'); dust(LX + 2, -2, 'purple'); dust(LX + 2, -3, 'purple'); rep(LX + 1, -3, 'west', 1, 'purple');
  dust(LX, -4, 'orange');

  // ---- feeders (master north): trunk along z=-11 to the split; E timeline gets the long way? no: E is NORTH, so E is the SHORT branch ----
  const flowDir = (a: XZ, b: XZ): Dir => (b[0] > a[0] ? 'east' : b[0] < a[0] ? 'west' : b[1] > a[1] ? 'south' : 'north');
  const line = (a: XZ, b: XZ): XZ[] => { const out: XZ[] = []; const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]); for (let p: XZ = [a[0], a[1]]; ; p = [p[0] + dx, p[1] + dz]) { out.push([p[0], p[1]]); if (p[0] === b[0] && p[1] === b[1]) break; } return out; };
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
  // E timeline first junction x = top (even), O timeline first junction x = top-1 (odd); E must be 2 rt LATER than O.
  const zF = -11;                                  // feeder row (north)
  const xSplit = eCols[0] + 1, xEast = 2 * n + 2;
  // O branch (long way round the east end to the south side), E branch (short, straight down to the north timeline)
  const oTail: XZ[] = [...line([xSplit + 1, zF], [xEast, zF]), ...line([xEast, zF + 1], [xEast, zTO]), ...line([xEast - 1, zTO], [oCols[0] + 1, zTO])];
  const oRep = Math.max(1, Math.floor(oTail.length / 12), 3);
  const eTailDelay = oRep + 1;                 // E stubs end in a repeater (1 rt), O taps are dust on a block: net offset 2 rt
  const eTail: XZ[] = line([xSplit, zF + 1], [xSplit, zTE]);
  const delayO = o.delayO ?? Math.max(12, 2 * n + 2);   // sim window: N=10 works from 16, N=12 from 18, N=6 from 8
  dust(xSplit, zF, 'orange');
  const trunk: XZ[] = [...line([LX, -5], [LX, zF]), ...line([LX + 1, zF], [xSplit - 1, zF])];
  layPath(trunk, delayO - oRep, 'orange', 'trunk', [LX, -4]);
  layPath(oTail, oRep, 'orange', 'O tail', [xSplit, zF]);
  layPath(eTail, eTailDelay, 'orange', 'E tail', [xSplit, zF]);
  return { lever, tip: [n, 1, 0] };
}

export const fastTipX = (w: World, n: number): number | null => { for (let x = -1; x <= 3 * n + 2; x++) if (w.get([x, 1, 0]).type === 'stone') return x; return null; };
export const fastHome = (w: World, n: number): boolean =>
  fastTipX(w, n) === n && Array.from({ length: n }, (_, x) => x).every((x) => w.get([x, 1, 0]).type === 'sticky_piston' && !w.read([x, 1, 0], 'extended'));

if (process.argv[1]?.endsWith('wave-arm-fast.ts')) {
  const n = Number(process.argv[2] ?? 10);
  const w = new World(); const { lever } = buildWaveArmFast(w, n);
  const bl = w.listBlocks(); const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const b of bl) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b.pos[i]); mx[i] = Math.max(mx[i], b.pos[i]); }
  console.log(`N=${n}: ${bl.length} blocks, size ${mx.map((v, i) => v - mn[i] + 1).join('x')}`);
  w.run(400);
  console.log('rest: home', fastHome(w, n));
  w.use(lever); let t = 0; while (t < 2000 && fastTipX(w, n) !== 2 * n) { w.run(1); t++; }
  console.log('lever ON: tip at', fastTipX(w, n), `after ${(t / 20).toFixed(2)} s`);
  w.run(60); w.use(lever); let t2 = 0; while (t2 < 3000 && !fastHome(w, n)) { w.run(1); t2++; }
  console.log('lever OFF: home', fastHome(w, n), `after ${(t2 / 20).toFixed(2)} s`);
  const f = new World(); buildWaveArmFast(f, n); f.run(400);
  writeFileSync(`examples/extender-${n}-wave-fast.schem`, exportSchem(f).buffer);
  console.log(`wrote examples/extender-${n}-wave-fast.schem`);
}
