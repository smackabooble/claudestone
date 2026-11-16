/**
 * Store a real-game lab run as a fixture (knowledge/lab-real-<n>.json): the real probe strings per cell and phase.
 *   npx tsx tools/labsave.ts <before.txt> <on.txt> <off.txt> <lever x,y,z> <out.json> [note]
 * test/lab.test.ts then checks that the simulator still gives the real answers.
 */
import { readFileSync, writeFileSync } from 'node:fs';
const [b, o, f, lv, out, note] = process.argv.slice(2);
const lab = JSON.parse(readFileSync('examples/lab-cells.txt', 'utf8'));
const lever = lv.split(',').map(Number); const off = lever.map((v, i) => v - lab.lever[i]);
const parse = (file: string) => {
  const m = new Map<string, { name: string; props: Record<string, string> }>();
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    const r = /^(-?\d+,-?\d+,-?\d+) ([a-z0-9_]+)\{(.*)\}\s*$/.exec(l); if (!r) continue;
    const props: Record<string, string> = {};
    if (r[3].trim()) for (const kv of r[3].split(',')) { const [k, v] = kv.split(':').map((q) => q.trim()); props[k] = v; }
    m.set(r[1], { name: r[2], props });
  }
  return m;
};
const snaps = [b, o, f].map(parse);
const read = (st: ReturnType<typeof parse>, pos: number[], obs: string[]) => {
  const c = st.get(pos.map((v, i) => v + off[i]).join(','));
  if (!c || c.name === 'air' || c.name === 'cave_air') return 'air';
  return [c.name, ...obs.map((k) => `${k}=${c.props[k] === undefined ? '-' : c.props[k]}`)].join(' ');
};
const cells: Record<string, { before: string[]; on: string[]; off: string[] }> = {};
for (const c of lab.cells) cells[c.id] = { before: c.probes.map((p: any) => read(snaps[0], p.pos, p.obs)), on: c.probes.map((p: any) => read(snaps[1], p.pos, p.obs)), off: c.probes.map((p: any) => read(snaps[2], p.pos, p.obs)) };
writeFileSync(out, JSON.stringify({ note: note ?? '', cells }, null, 0));
console.log('saved', Object.keys(cells).length, 'cells to', out);
