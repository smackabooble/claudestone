/**
 * The lab (examples/lab.ts): print the simulator's answers, or compare them with a real-game trace.
 *   npx tsx tools/labcheck.ts sim [group-substring]
 *   npx tsx tools/labcheck.ts compare <before.txt> <on.txt> <off.txt> <lever world x,y,z>
 * The three snapshots come from tools/labsnap.sc over the whole lab box (lab-cells.txt "box", relative to the pasted lab): before the flick,
 * after the lever is ON (10 s), after it is OFF again (10 s).
 */
import { readFileSync } from 'node:fs';

interface P { name: string; pos: [number, number, number]; obs: string[]; sim: { before: string; on: string; off: string } }
interface C { id: string; group: string; desc: string; origin: number[]; probes: P[] }
const lab = JSON.parse(readFileSync('examples/lab-cells.txt', 'utf8')) as { lever: number[]; cells: C[] };

const mode = process.argv[2];
if (mode === 'sim') {
  const filter = process.argv[3] ?? '';
  for (const c of lab.cells.filter((x) => x.group.includes(filter) || x.id.includes(filter))) {
    console.log(`${c.id.padEnd(34)} ${c.probes.map((p) => `${p.name}: ${p.sim.on}${p.sim.off !== p.sim.on ? '  (off: ' + p.sim.off + ')' : ''}`).join(' | ')}`);
  }
} else if (mode === 'compare') {
  // compare <before.txt> <on.txt> <off.txt> <lever world x,y,z>   (snapshots from tools/labsnap.sc)
  const files = process.argv.slice(3, 6);
  const lv = (process.argv[6] ?? '').split(',').map(Number);
  if (files.length !== 3 || lv.length !== 3 || lv.some((v) => !Number.isFinite(v))) { console.log('usage: compare <before.txt> <on.txt> <off.txt> <lever x,y,z in the real world>'); process.exit(1); }
  const off = lv.map((v, i) => v - lab.lever[i]);
  const parse = (f: string) => {
    const m = new Map<string, { name: string; props: Record<string, string> }>();
    for (const l of readFileSync(f, 'utf8').split('\n')) {
      const r = /^(-?\d+,-?\d+,-?\d+) ([a-z0-9_]+)\{(.*)\}\s*$/.exec(l); if (!r) continue;
      const props: Record<string, string> = {};
      if (r[3].trim()) for (const kv of r[3].split(',')) { const [k, v] = kv.split(':').map((q) => q.trim()); props[k] = v; }
      m.set(r[1], { name: r[2], props });
    }
    return m;
  };
  const snaps = files.map(parse);
  const phases = ['before', 'on', 'off'] as const;
  const read = (st: ReturnType<typeof parse>, pos: number[], obs: string[]): string => {
    const c = st.get(pos.map((v, i) => v + off[i]).join(','));
    if (!c || c.name === 'air' || c.name === 'cave_air') return 'air';
    return [c.name, ...obs.map((k) => `${k}=${c.props[k] === undefined ? '-' : c.props[k]}`)].join(' ');
  };
  let bad = 0; const byGroup: Record<string, [number, number]> = {};
  for (const c of lab.cells) {
    byGroup[c.group] ??= [0, 0]; byGroup[c.group][1]++;
    const lines: string[] = [];
    phases.forEach((ph, k) => {
      const sim = c.probes.map((p) => p.sim[ph]).join(' | ');
      const real = c.probes.map((p) => read(snaps[k], p.pos, p.obs)).join(' | ');
      if (sim !== real) lines.push(`   ${ph.padEnd(6)} sim:  ${sim}\n          real: ${real}`);
    });
    if (lines.length) { bad++; byGroup[c.group][0]++; console.log(`${c.id}  (${c.desc})\n${lines.join('\n')}`); }
  }
  console.log('\nDIFFERENT / TOTAL per group:', JSON.stringify(byGroup));
  console.log(`cells that differ: ${bad} of ${lab.cells.length}`);
} else console.log('usage: labcheck.ts sim [filter] | compare <trace> <lever x,y,z>');
