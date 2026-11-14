/**
 * Diagnostic 2: corners and T's in every orientation, to see which stored arms a viewer draws wrongly.
 * Run: npx tsx examples/dust-test2.ts
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem, toBlockState } from '../src/export.ts';
import type { Dir, Pos } from '../src/dirs.ts';

const OFF: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
export const GROUPS: { label: string; arms: Dir[] }[] = [
  { label: 'A corner N+E', arms: ['north', 'east'] },
  { label: 'B corner N+W', arms: ['north', 'west'] },
  { label: 'C corner S+E', arms: ['south', 'east'] },
  { label: 'D corner S+W', arms: ['south', 'west'] },
  { label: 'E T  E+W+S (no north)', arms: ['east', 'west', 'south'] },
  { label: 'F T  E+W+N (no south)', arms: ['east', 'west', 'north'] },
  { label: 'G T  N+S+W (no east)', arms: ['north', 'south', 'west'] },
  { label: 'H T  N+S+E (no west)', arms: ['north', 'south', 'east'] },
];

export function buildTest2(w: World): { label: string; center: Pos }[] {
  for (let x = 0; x < GROUPS.length * 6 + 2; x++) for (let z = 0; z < 7; z++) w.place([x, 0, z], 'stone');
  const centers: { label: string; center: Pos }[] = [];
  GROUPS.forEach((g, i) => {
    const c: Pos = [3 + i * 6, 1, 3];
    w.place(c, 'redstone_wire');
    for (const a of g.arms) w.place([c[0] + OFF[a][0], 1, c[2] + OFF[a][1]], 'redstone_wire');
    centers.push({ label: g.label, center: c });
  });
  w.run(5);
  return centers;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World();
  const centers = buildTest2(w);
  const out = exportSchem(w);
  writeFileSync('examples/dust-test2.schem', out.buffer);
  console.log('size', out.size.join('x'), 'origin', out.origin.join(','));
  for (const c of centers)
    console.log(c.label.padEnd(24), `(${c.center[0] - out.origin[0]},${c.center[1] - out.origin[1]},${c.center[2] - out.origin[2]})`, toBlockState(w.get(c.center)).replace('minecraft:', ''));
}
