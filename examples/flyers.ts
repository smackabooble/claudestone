/** FLYING MACHINES without observers (pistons + slime + redstone blocks only), found by search in the simulator (see knowledge/LEARNINGS.md). Grid: row 0 = top, x east, 3 rows. */
import { World } from '../src/world.ts';
type G = string;
export const FLYERS: Record<string, { grid: G; note: string }> = {
  search1: { grid: `. . S P< . . .
. P> S R . . .
. R S . P< . .`, note: 'first observer-free machine the search found (west, ~1 block per 15 ticks)' },
  search2: { grid: `. P> S P< . . . .
. R S R . . . .
. . S P< . . . .`, note: 'optimizer variant, 8 blocks, west, ~1 block per 12 ticks' },
  thumb: { grid: `. R . . R .
. S P< P> S P<`, note: 'UseFool thumbnail read from a screenshot (sim and REAL 26.3: does NOT fly)' },
};
const D: Record<string, string> = { '>': 'east', '<': 'west', '^': 'up', v: 'down' };
export function buildFlyer(w: World, name: string, ox = 40, oy = 5) {
  const rows = FLYERS[name].grid.trim().split('\n').map((r) => r.trim().split(/\s+/)); const H = rows.length; let start: [number, number, number] = [0, 0, 0];
  rows.forEach((r, i) => r.forEach((c, x) => { const y = H - 1 - i; const p: [number, number, number] = [x + ox, y + oy, 0]; if (c === '.') return;
    if (c === 'S') w.setRaw(p, 'slime_block'); else if (c === 'R') { w.setRaw(p, 'redstone_block'); start = p; } else w.setRaw(p, c[0] === 'P' ? 'sticky_piston' : 'piston', { facing: D[c[1]], extended: false }); }));
  const snap = () => w.listBlocks().map((b) => ({ ...b }));
  return { start: [start[0] - 0, start[1], start[2]] as [number, number, number], simDisplacement: (ticks: number) => { const minx = () => Math.min(...w.listBlocks().filter((b) => !['piston_head', 'moving_piston'].includes(b.type)).map((b) => b.pos[0])); w.pasteUpdates(); const x0 = minx(); w.run(ticks); return minx() - x0; } };
}

import { writeFileSync } from 'node:fs';
import { exportSchem } from '../src/export.ts';
if (import.meta.url === `file://${process.argv[1]}`) for (const n of Object.keys(FLYERS)) { const w = new World(); buildFlyer(w, n); w.pasteUpdates(); writeFileSync(`examples/flyer-${n}.schem`, exportSchem(w).buffer); }
