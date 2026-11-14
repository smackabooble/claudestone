/**
 * THE LAB: one lever, many small independent cells, each testing one rule of the real game (conduction, dust support, quasi-connectivity,
 * what a piston pushes / pulls / glues). Build it with `npx tsx examples/lab.ts` (writes examples/lab.schem + examples/lab-cells.txt).
 * Record it in the real game with tools/doortrace.sc (box around the whole lab, flick the lever ON, wait 150 ticks, flick OFF, wait 150 ticks)
 * and compare with `npx tsx tools/labcheck.ts compare <trace.txt>`.
 *
 * Layout: floor of obsidian at y=-3, a lever at (-1,1,0) feeding a dust bus along +x at z = row*16 (repeater every 8 cells); the rows hang
 * on a spine along z at x=0. Every cell k sits at x = 6 + 8k: a stub repeater at (x,1,z+1) flows south into the cell origin L0 = (x,1,z+2),
 * which is a conductor block that is STRONGLY powered while the lever is ON. Cells put the block / piston / dust under test around L0.
 * Probes: positions + the properties that are read at the end of each phase (lever ON settled, lever OFF settled).
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { buildGrid, observe, probe, type Def, type Probe, type Cell, type Rel } from './lab-core.ts';
export { observe };
import type { Dir, Pos } from '../src/dirs.ts';


/** blocks tested for conduction, dust support, being pushed / pulled (sim name; props for placing) */
const BLOCKS: [string, Record<string, any>?][] = [
  ['stone'], ['obsidian'], ['glass'], ['sand'], ['slime_block'], ['honey_block'], ['soul_sand'], ['iron_block'], ['coal_block'], ['hay_block'],
  ['furnace'], ['hopper', { facing: 'down', enabled: true }], ['dropper', { facing: 'north', triggered: false }], ['observer', { facing: 'north', powered: false }], ['leaves'], ['partial'], ['stairs', { facing: 'north' }], ['pane'],
  ['chest', { facing: 'north' }], ['barrel'], ['composter'], ['target'], ['note_block'], ['log'], ['ice'], ['gravel'], ['white_wool'],
];
const props = (b: [string, Record<string, any>?]) => b[1] ?? {};
/** place a block under test; falling blocks get an obsidian block under them (otherwise the test block just falls away) */
const putB = (w: World, pos: Pos, b: [string, Record<string, any>?]) => {
  w.setRaw(pos, b[0], props(b));
  if (['sand', 'gravel', 'red_sand'].includes(b[0])) for (const dx of [0, 1]) w.setRaw([pos[0] + dx, pos[1] - 1, pos[2]], 'obsidian');   // also under the cell it is pushed into
};

const defs: Def[] = [];
const add = (id: string, group: string, desc: string, build: Build) => defs.push({ id, group, desc, build });

// ---- A: conduction. The block at L0 is strongly powered; lamps on three sides tell whether it conducts (lit) ----
for (const b of BLOCKS) {
  add(`A.cond.${b[0]}`, 'conduction', `does ${b[0]} conduct strong power? (lamps east, west, south of it)`, (w, at) => {
    putB(w, at(0, 0, 0), b);
    const ps: Probe[] = [];
    for (const [dx, dz, n] of [[1, 0, 'east'], [-1, 0, 'west'], [0, 1, 'south']] as [number, number, string][]) {
      w.setRaw(at(dx, 0, dz), 'redstone_lamp', { lit: false }); ps.push(probe('lamp ' + n, at(dx, 0, dz), 'lit'));
    }
    ps.push(probe('block', at(0, 0, 0)));
    return ps;
  });
}

// ---- B: dust support: dust on top of a (powered) block: does it survive, does it get power ----
for (const b of BLOCKS) {
  add(`B.dust.${b[0]}`, 'dust support', `dust on top of a powered ${b[0]}: survives? power level`, (w, at) => {
    putB(w, at(0, 0, 0), b);
    w.setRaw(at(0, 1, 0), 'redstone_wire');
    return [probe('dust', at(0, 1, 0), 'power'), probe('block', at(0, 0, 0))];
  });
}

// ---- C: what does a sticky piston push and pull? piston east of L0 (L0 is a stone conductor that powers it), target block two east ----
for (const b of BLOCKS) {
  add(`C.push.${b[0]}`, 'piston push/pull', `sticky piston pushes (lever ON) and pulls (lever OFF) ${b[0]}`, (w, at) => {
    w.setRaw(at(0, 0, 0), 'stone');
    w.setRaw(at(1, 0, 0), 'sticky_piston', { facing: 'east', extended: false });
    putB(w, at(2, 0, 0), b);
    return [probe('piston', at(1, 0, 0), 'extended'), probe('target start', at(2, 0, 0)), probe('target pushed', at(3, 0, 0))];
  });
}

// ---- D: glue: slime next to a block, a piston pushes the slime ----
for (const b of BLOCKS) {
  add(`D.glue.${b[0]}`, 'slime glue', `slime pushed by a piston, ${b[0]} beside it: dragged along?`, (w, at) => {
    w.setRaw(at(0, 0, 0), 'stone');
    w.setRaw(at(1, 0, 0), 'piston', { facing: 'east', extended: false });
    w.setRaw(at(2, 0, 0), 'slime_block');
    putB(w, at(2, 0, 1), b);
    return [probe('slime start', at(2, 0, 0)), probe('slime pushed', at(3, 0, 0)), probe('beside start', at(2, 0, 1)), probe('beside pushed', at(3, 0, 1))];
  });
}

// ---- E: quasi-connectivity. L0 (powered conductor) sits at vector v from the piston/dropper P; P facing south pushes a stone at P+south ----
const QC: [string, [number, number, number]][] = [
  ['above P (direct)', [0, 1, 0]], ['below P', [0, -1, 0]], ['east of P', [1, 0, 0]], ['west of P', [-1, 0, 0]], ['behind P (north)', [0, 0, -1]],
  ['2 above P (QC)', [0, 2, 0]], ['above+east of P (QC)', [1, 1, 0]], ['above+west of P (QC)', [-1, 1, 0]], ['above+north of P (QC)', [0, 1, -1]],
  ['east+south of P (diagonal, no QC)', [1, 0, 1]], ['2 above + east (no QC)', [1, 2, 0]],
];
const man = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
for (const [name, v] of QC) {
  const direct = man(v, [0, 0, 0]) === 1;
  for (const pt of ['piston', 'sticky_piston', 'dropper', 'dispenser', 'hopper']) {
    for (const kick of direct ? [false] : [true, false]) {
      add(`E.qc.${pt}.${v.join(',')}${direct ? '' : kick ? '.kick' : '.nokick'}`, 'quasi-connectivity',
        `${pt}, powered conductor ${name}${direct ? '' : kick ? ', a note block next to both toggles (a block update reaches P; lamps do not update neighbours)' : ', no block update reaches P (pure BUD)'}`, (w, at) => {
        const P: Pos = at(-v[0], -v[1], -v[2]);
        const rel = (dx: number, dy: number, dz: number): Pos => [P[0] + dx, P[1] + dy, P[2] + dz];
        w.setRaw(at(0, 0, 0), 'stone');
        const f: Dir = pt === 'hopper' ? 'down' : 'south';
        w.setRaw(P, pt, pt === 'hopper' ? { facing: f, enabled: true } : pt === 'dropper' || pt === 'dispenser' ? { facing: f, triggered: false } : { facing: f, extended: false });
        const isP = pt === 'piston' || pt === 'sticky_piston';
        const Q = rel(0, 0, 1);
        if (isP) w.setRaw(Q, 'stone');
        if (kick) {
          // a note block in a cell next to both the piston and the powered block: its powered state flips (flag 3) and updates the piston
          const L0 = at(0, 0, 0);
          for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, -1], [0, 0, 1], [0, -1, 0]]) {
            const c = rel(dx, dy, dz);
            if (man(c, L0) !== 1 || (isP && man(c, Q) === 0) || man(c, L0) === 0 || w.get(c).type !== 'air') continue;   // never over the bus, a stub or another part
            w.setRaw(c, 'note_block', { powered: false }); break;
          }
        }
        return isP ? [probe('P', P, 'extended'), probe('pushed', rel(0, 0, 2))]
          : pt === 'dropper' || pt === 'dispenser' ? [probe('P', P, 'triggered')] : [probe('P', P, 'enabled')];
      });
    }
  }
}

export function buildLab(w: World) { return buildGrid(w, defs); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World();
  const lab = buildLab(w);
  w.run(40);
  const snap = () => lab.cells.map((c) => c.probes.map((p) => observe(w, p)));
  const before = snap();
  w.use(lab.lever); w.run(150);
  const on = snap();
  w.use(lab.lever); w.run(150);
  const off = snap();
  const out = exportSchem(w);
  writeFileSync('examples/lab.schem', out.buffer);
  const cells = lab.cells.map((c, i) => ({ id: c.id, group: c.group, desc: c.desc, origin: c.origin, probes: c.probes.map((p, j) => ({ name: p.name, pos: p.pos, obs: p.obs, sim: { before: before[i][j], on: on[i][j], off: off[i][j] } })) }));
  writeFileSync('examples/lab-cells.txt', JSON.stringify({ lever: lab.lever, box: lab.box, schemOrigin: out.origin, cells }, null, 1));
  console.log(`cells ${cells.length}, blocks ${w.listBlocks().length}, schematic ${out.size.join('x')} origin ${out.origin.join(',')}, lever ${lab.lever.join(',')}, box ${lab.box.map((b) => b.join(',')).join(' .. ')}`);
}
