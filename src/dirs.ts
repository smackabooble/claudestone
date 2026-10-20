export type Dir = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';
export type Pos = [number, number, number];

/** Direction.values() order */
export const DIRS: Dir[] = ['down', 'up', 'north', 'south', 'west', 'east'];
/** Neighbor update order used by Level.updateNeighborsAt */
export const UPDATE_ORDER: Dir[] = ['west', 'east', 'down', 'up', 'north', 'south'];
/** Direction.Plane.HORIZONTAL order */
export const HORIZONTAL: Dir[] = ['north', 'east', 'south', 'west'];

const VEC: Record<Dir, Pos> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

const OPP: Record<Dir, Dir> = {
  down: 'up', up: 'down', north: 'south', south: 'north', west: 'east', east: 'west',
};

const CW: Record<string, Dir> = { north: 'east', east: 'south', south: 'west', west: 'north' };

export const opposite = (d: Dir): Dir => OPP[d];
export const clockwise = (d: Dir): Dir => CW[d];
export const counterClockwise = (d: Dir): Dir => OPP[CW[d]];
export const rel = (p: Pos, d: Dir): Pos => [p[0] + VEC[d][0], p[1] + VEC[d][1], p[2] + VEC[d][2]];
export const key = (p: Pos): string => `${p[0]},${p[1]},${p[2]}`;
export const isHorizontal = (d: Dir): boolean => d !== 'up' && d !== 'down';

/** Iteration order of a java.util.HashSet<BlockPos> with <=12 entries (table size 16). */
export function javaSetOrder(ps: Pos[]): Pos[] {
  const seen = new Set<string>();
  const uniq: Pos[] = [];
  for (const p of ps) if (!seen.has(key(p))) { seen.add(key(p)); uniq.push(p); }
  const bucket = (p: Pos): number => {
    const h = (Math.imul((p[1] + Math.imul(p[2], 31)) | 0, 31) + p[0]) | 0;
    return (h ^ (h >>> 16)) & 15;
  };
  return uniq
    .map((p, i) => ({ p, i, b: bucket(p) }))
    .sort((a, b) => a.b - b.b || a.i - b.i)
    .map((e) => e.p);
}
