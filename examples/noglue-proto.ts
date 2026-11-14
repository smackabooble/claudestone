// prototype: own glue-free 4x4 door, ideal feeders (redstone blocks at z=1)
import { World } from '../src/world.ts';
import type { Pos } from '../src/dirs.ts';
export type Grp = 'rowP1' | 'rowP2' | 'colP1' | 'colP2' | 'm1';
export interface Pst { id: string; pos: Pos; face: string; grp: Grp }
export const pistons: Pst[] = [];
export const blocks: { pos: Pos; col: string }[] = [];
const add = (id: string, x: number, y: number, face: string, grp: Grp) => pistons.push({ id, pos: [x, y, 0], face, grp });
const blk = (x: number, y: number, col = 'white') => blocks.push({ pos: [x, y, 0], col });
// left / right rows
for (const y of [0, 3]) { add(`L${y}`, -2, y, 'east', 'm1'); blk(-1, y); add(`R${y}`, 5, y, 'west', 'm1'); blk(4, y); }
for (const y of [1, 2]) { add(`LP2_${y}`, -2, y, 'east', 'rowP2'); add(`LP1_${y}`, -3, y, 'east', 'rowP1'); blk(-1, y); add(`RP2_${y}`, 5, y, 'west', 'rowP2'); add(`RP1_${y}`, 6, y, 'west', 'rowP1'); blk(4, y); }
for (const x of [1, 2]) { add(`B${x}`, x, -2, 'up', 'm1'); blk(x, -1); add(`T${x}`, x, 5, 'down', 'm1'); blk(x, 4); }
for (const x of [0, 3]) { add(`BP2_${x}`, x, -2, 'up', 'colP2'); add(`BP1_${x}`, x, -3, 'up', 'colP1'); blk(x, -1); add(`TP2_${x}`, x, 5, 'down', 'colP2'); add(`TP1_${x}`, x, 6, 'down', 'colP1'); blk(x, 4); }
export const DOORWAY: Pos[] = [0, 1, 2, 3].flatMap((x) => [0, 1, 2, 3].map((y) => [x, y, 0] as Pos));

export function buildMachine(w: World, feeder: (p: Pst) => void) {
  for (const b of blocks) w.place(b.pos, `${b.col}_wool`);
  for (const p of pistons) { w.place(p.pos, 'sticky_piston', { facing: p.face }); feeder(p); }
}

/** feeder cells (z=1 side) per group; QC (quasi-connectivity) makes one feeder serve the piston(s) below it */
export const feeders: Record<Grp, Pos[]> = {
  rowP1: [[-3, 2, 1], [6, 2, 1]],
  rowP2: [[-2, 2, 1], [-1, 2, 1], [5, 2, 1], [4, 2, 1]],
  colP1: [[0, -3, 1], [3, -3, 1], [0, 7, 1], [3, 7, 1]],
  colP2: [[0, -1, 1], [3, -1, 1], [0, 5, 1], [3, 5, 1]],
  m1: [[-2, 4, 1], [-2, 0, 1], [5, 4, 1], [5, 0, 1], [1, -1, 1], [2, -1, 1], [1, 5, 1], [2, 5, 1]],
};
