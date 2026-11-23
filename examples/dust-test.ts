/**
 * Diagnostic: every dust shape on a stone floor, to see how a viewer/converter draws them.
 * Run: npx tsx examples/dust-test.ts   (writes examples/dust-test.schem and prints the layout)
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem, toBlockState } from '../src/export.ts';

export function buildDustTest(w: World): { label: string; cells: [number, number, number][] }[] {
  for (let x = 0; x < 34; x++) for (let z = 0; z < 8; z++) w.place([x, 0, z], 'stone');
  const wires = (cells: [number, number, number][]) => cells.forEach((c) => w.place(c, 'redstone_wire'));
  const groups: { label: string; cells: [number, number, number][] }[] = [
    { label: '1 line (E-W)', cells: [[1, 1, 3], [2, 1, 3], [3, 1, 3]] },
    { label: '2 CORNER (L)', cells: [[7, 1, 4], [8, 1, 4], [8, 1, 3]] },
    { label: '3 T', cells: [[12, 1, 3], [13, 1, 3], [14, 1, 3], [13, 1, 2]] },
    { label: '4 cross', cells: [[18, 1, 3], [19, 1, 3], [20, 1, 3], [19, 1, 2], [19, 1, 4]] },
    { label: '5 lone dust (cross)', cells: [[24, 1, 3]] },
    { label: '6 lone dust right-clicked (dot)', cells: [[28, 1, 3]] },
    { label: '7 stair step (up one block)', cells: [[31, 1, 3], [32, 2, 3]] },
  ];
  w.place([32, 1, 3], 'stone'); // the block the upper dust of the stair sits on
  for (const g of groups) wires(g.cells);
  w.use([28, 1, 3]); // cross -> dot
  w.run(5);
  return groups;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World();
  const groups = buildDustTest(w);
  const out = exportSchem(w);
  writeFileSync('examples/dust-test.schem', out.buffer);
  console.log('size', out.size.join('x'), 'origin', out.origin.join(','));
  for (const g of groups) {
    console.log(`\n${g.label}`);
    for (const c of g.cells) {
      const b = w.get(c);
      console.log(`  schematic pos (${c[0] - out.origin[0]},${c[1] - out.origin[1]},${c[2] - out.origin[2]})  ${toBlockState(b).replace('minecraft:', '')}`);
    }
  }
}
