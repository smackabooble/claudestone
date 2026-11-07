/**
 * LAB 2: timing + the leaves puzzle. Same grid as the first lab (examples/lab-core.ts): one lever, cells fed by stub repeaters.
 * Build: `npx tsx examples/lab2.ts` -> examples/lab2.schem + examples/lab2-cells.txt (cells, probes, the simulator's per-tick events).
 * Record the real game with tools/gearrec.sc (`/gearrec full <corner> <corner>`), flick the lever ON, wait 6 s, OFF, wait 6 s, `/gearrec stop`;
 * compare with `npx tsx tools/labtrace.ts compare <rec.txt> <lever x,y,z>`.
 * Every probe is read every tick; the events are state changes with their tick relative to the lever flick.
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { buildGrid, observe, probe, inv, type Def, type Probe, type Rel } from './lab-core.ts';
import type { Pos } from '../src/dirs.ts';

const GEN = ['extended', 'powered', 'lit', 'triggered', 'enabled', 'power', 'locked', 'type'];
const defs: Def[] = [];
const add = (id: string, group: string, desc: string, build: (w: World, at: Rel) => Probe[]) => defs.push({ id, group, desc, build });
const P = (name: string, pos: Pos) => probe(name, pos, ...GEN);
const stone = (w: World, at: Rel) => w.setRaw(at(0, 0, 0), 'stone');

// ---- L: the leaves puzzle: leaves pushed by a sticky piston vanished in the real game (lab 1). Which leaves, which piston? ----
const leafCase = (id: string, desc: string, piston: 'sticky_piston' | 'piston', lp: Record<string, any>, extra?: (w: World, at: Rel) => void) =>
  add(id, 'leaves', desc, (w, at) => {
    stone(w, at);
    w.setRaw(at(1, 0, 0), piston, { facing: 'east', extended: false });
    w.setRaw(at(2, 0, 0), 'leaves', lp);
    extra?.(w, at);
    return [P('piston', at(1, 0, 0)), P('leaves start', at(2, 0, 0)), P('leaves pushed', at(3, 0, 0)), P('after', at(4, 0, 0))];
  });
leafCase('L.sticky.persistent', 'sticky piston pushes leaves (distance 1, persistent) - the lab 1 case', 'sticky_piston', { distance: 1, persistent: true });
leafCase('L.sticky.notpersistent', 'sticky piston pushes leaves (distance 1, NOT persistent)', 'sticky_piston', { distance: 1, persistent: false });
leafCase('L.sticky.d7', 'sticky piston pushes leaves (distance 7, persistent)', 'sticky_piston', { distance: 7, persistent: true });
leafCase('L.plain.persistent', 'plain piston pushes leaves (distance 1, persistent)', 'piston', { distance: 1, persistent: true });
leafCase('L.plain.notpersistent', 'plain piston pushes leaves (distance 1, NOT persistent)', 'piston', { distance: 1, persistent: false });
leafCase('L.sticky.log', 'sticky piston pushes leaves, a log sits next to the destination', 'sticky_piston', { distance: 1, persistent: true }, (w, at) => w.setRaw(at(3, 0, 1), 'log'));
leafCase('L.sticky.2long', 'sticky piston pushes two leaves in a row', 'sticky_piston', { distance: 1, persistent: true }, (w, at) => w.setRaw(at(3, 0, 0), 'leaves', { distance: 1, persistent: true }));
leafCase('L.sticky.stone', 'control: sticky piston pushes stone', 'sticky_piston', {}, (w, at) => w.setRaw(at(2, 0, 0), 'stone'));

// ---- T: piston timing ----
for (const [pt, tag] of [['piston', 'plain'], ['sticky_piston', 'sticky']] as const) {
  add(`T.piston.${tag}`, 'timing', `${tag} piston extension (ON) and retraction (OFF) of a stone`, (w, at) => {
    stone(w, at); w.setRaw(at(1, 0, 0), pt, { facing: 'east', extended: false }); w.setRaw(at(2, 0, 0), 'stone');
    return [P('piston', at(1, 0, 0)), P('target', at(2, 0, 0)), P('pushed', at(3, 0, 0))];
  });
}
// ---- repeaters: delay 1..4 from L0 to a lamp ----
for (const d of [1, 2, 3, 4]) {
  add(`T.repeater.d${d}`, 'timing', `repeater delay ${d}: L0 -> repeater -> lamp`, (w, at) => {
    stone(w, at); w.setRaw(at(1, 0, 0), 'repeater', { facing: 'west', delay: d, powered: false }); w.setRaw(at(2, 0, 0), 'redstone_lamp', { lit: false });
    return [P('repeater', at(1, 0, 0)), P('lamp', at(2, 0, 0))];
  });
}
// ---- repeater lock: a side repeater powered through dust from L0 locks the main repeater (delay 4) ----
add('T.repeater.lock', 'timing', 'repeater (delay 4) with a side repeater (delay 1) that locks it', (w, at) => {
  stone(w, at);
  w.setRaw(at(1, 0, 0), 'repeater', { facing: 'west', delay: 4, powered: false });
  w.setRaw(at(2, 0, 0), 'redstone_lamp', { lit: false });
  w.setRaw(at(0, 0, 1), 'redstone_wire'); w.setRaw(at(0, 0, 2), 'redstone_wire'); w.setRaw(at(1, 0, 2), 'redstone_wire');
  w.setRaw(at(1, 0, 1), 'repeater', { facing: 'south', delay: 1, powered: false });   // input from the dust south of it, output north into the side of the main repeater
  return [P('main repeater', at(1, 0, 0)), P('side repeater', at(1, 0, 1)), P('lamp', at(2, 0, 0))];
});
// ---- torch inverter, observer, comparator ----
add('T.torch', 'timing', 'wall torch on L0 (turns off when L0 is powered)', (w, at) => {
  stone(w, at); w.setRaw(at(1, 0, 0), 'redstone_wall_torch', { facing: 'east', lit: true }); w.setRaw(at(2, 0, 0), 'stone'); w.setRaw(at(3, 0, 0), 'redstone_lamp', { lit: false });
  return [P('torch', at(1, 0, 0)), P('lamp', at(3, 0, 0)), P('stone', at(2, 0, 0))];
});
add('T.observer', 'timing', 'lamp next to L0 -> observer watching it -> stone -> lamp', (w, at) => {
  stone(w, at); w.setRaw(at(1, 0, 0), 'redstone_lamp', { lit: false }); w.setRaw(at(2, 0, 0), 'observer', { facing: 'west', powered: false });
  w.setRaw(at(3, 0, 0), 'stone'); w.setRaw(at(4, 0, 0), 'redstone_lamp', { lit: false });
  return [P('lamp A', at(1, 0, 0)), P('observer', at(2, 0, 0)), P('lamp B', at(4, 0, 0))];
});
add('T.comparator', 'timing', 'dust from L0 -> comparator (compare) -> lamp', (w, at) => {
  stone(w, at); w.setRaw(at(1, 0, 0), 'redstone_wire'); w.setRaw(at(2, 0, 0), 'comparator', { facing: 'west', mode: 'compare', powered: false }); w.setRaw(at(3, 0, 0), 'stone'); w.setRaw(at(4, 0, 0), 'redstone_lamp', { lit: false });
  return [P('dust', at(1, 0, 0)), P('comparator', at(2, 0, 0)), P('lamp', at(4, 0, 0))];
});
add('T.comparator.chest', 'timing', 'comparator reading a chest with 3 items, powered stone adjacent', (w, at) => {
  stone(w, at);
  w.setRaw(at(1, 0, 0), 'chest', { facing: 'north' }); w.setItem(at(1, 0, 0), 0, { id: 'cobblestone', count: 3 });
  w.setRaw(at(2, 0, 0), 'comparator', { facing: 'west', mode: 'compare', powered: false }); w.setRaw(at(3, 0, 0), 'stone'); w.setRaw(at(4, 0, 0), 'redstone_lamp', { lit: false });
  return [P('comparator', at(2, 0, 0)), P('lamp', at(4, 0, 0))];
});
// ---- hopper / dropper ----
add('T.hopper.lock', 'timing', 'hopper locked by a lit torch (torch on L0 goes OFF when the lever is ON = hopper unlocked)', (w, at) => {
  stone(w, at);
  w.setRaw(at(1, 0, 0), 'redstone_wall_torch', { facing: 'east', lit: true });
  w.setRaw(at(2, 0, 0), 'hopper', { facing: 'east', enabled: false }); w.setRaw(at(2, 1, 0), 'chest', { facing: 'north' }); w.setRaw(at(3, 0, 0), 'chest', { facing: 'north' });
  for (let i = 0; i < 4; i++) w.setItem(at(2, 1, 0), i, { id: 'cobblestone', count: 8 });
  return [P('torch', at(1, 0, 0)), P('hopper', at(2, 0, 0)), inv('source chest', at(2, 1, 0)), inv('target chest', at(3, 0, 0)), inv('hopper', at(2, 0, 0))];
});
add('T.dropper', 'timing', 'dropper next to L0 with 2 items, a hopper in front: fires when the lever goes ON', (w, at) => {
  stone(w, at);
  w.setRaw(at(1, 0, 0), 'dropper', { facing: 'east', triggered: false }); w.setItem(at(1, 0, 0), 0, { id: 'cobblestone', count: 2 });
  w.setRaw(at(2, 0, 0), 'hopper', { facing: 'down', enabled: true }); w.setRaw(at(2, -1, 0), 'chest', { facing: 'north' });
  return [P('dropper', at(1, 0, 0)), inv('dropper', at(1, 0, 0)), inv('hopper', at(2, 0, 0)), inv('chest', at(2, -1, 0))];
});
// ---- sand and pistons ----
add('T.sand.up', 'timing', 'plain piston facing up pushes a sand block up (ON), the sand falls back when it retracts (OFF)', (w, at) => {
  stone(w, at); w.setRaw(at(1, 0, 0), 'piston', { facing: 'up', extended: false }); w.setRaw(at(1, 1, 0), 'sand');
  w.setRaw(at(1, -1, 0), 'obsidian');
  return [P('piston', at(1, 0, 0)), P('y1', at(1, 1, 0)), P('y2', at(1, 2, 0)), P('y3', at(1, 3, 0))];
});
add('T.sand.sticky', 'timing', 'sticky piston facing up pushes sand up (ON) and pulls it back (OFF)', (w, at) => {
  stone(w, at); w.setRaw(at(1, 0, 0), 'sticky_piston', { facing: 'up', extended: false }); w.setRaw(at(1, 1, 0), 'sand');
  return [P('piston', at(1, 0, 0)), P('y1', at(1, 1, 0)), P('y2', at(1, 2, 0)), P('y3', at(1, 3, 0))];
});
add('T.sand.slide', 'timing', 'sand block pushed sideways off a ledge by a plain piston: when does it fall?', (w, at) => {
  stone(w, at); w.setRaw(at(1, 0, 0), 'piston', { facing: 'east', extended: false }); w.setRaw(at(2, 0, 0), 'sand'); w.setRaw(at(2, -1, 0), 'obsidian');
  return [P('piston', at(1, 0, 0)), P('start', at(2, 0, 0)), P('pushed', at(3, 0, 0)), P('below pushed', at(3, -1, 0)), P('floor', at(3, -2, 0))];
});

export function buildLab2(w: World) { return buildGrid(w, defs, 7); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World();
  const lab = buildLab2(w);
  w.run(40);
  const flat = lab.cells.flatMap((c) => c.probes.map((p) => ({ cell: c.id, p })));
  const PH = 100;
  const cur = () => flat.map((f) => observe(w, f.p));
  const init = cur();
  const trace: { phase: string; t: number; i: number; v: string }[] = [];
  const falling: { phase: string; t: number; pos: number[][] }[] = [];
  const run = (phase: string) => {
    let last = cur();
    for (let t = 1; t <= PH; t++) { w.run(1); if (w.falling.length) falling.push({ phase, t, pos: w.falling.map((f: any) => [f.x, f.y, f.z, f.vy]).sort() }); const now = cur(); for (let i = 0; i < now.length; i++) if (now[i] !== last[i]) trace.push({ phase, t, i, v: now[i] }); last = now; }
  };
  w.use(lab.lever); run('on');
  w.use(lab.lever); run('off');
  const out = exportSchem(w);
  const events: Record<string, { on: [number, string][]; off: [number, string][] }>[] = [];
  const cells = lab.cells.map((c) => ({ id: c.id, group: c.group, desc: c.desc, origin: c.origin, probes: c.probes.map((p) => ({ name: p.name, pos: p.pos, obs: p.obs, inv: !!p.inv })) }));
  let k = 0;
  const probeEvents = flat.map((f, i) => ({ cell: f.cell, name: f.p.name, init: init[i], on: trace.filter((t) => t.i === i && t.phase === 'on').map((t) => [t.t, t.v]), off: trace.filter((t) => t.i === i && t.phase === 'off').map((t) => [t.t, t.v]) }));
  void events; void k;
  // the exported world is the state AFTER both flicks; re-export the fresh lab for the schematic
  const w2 = new World(); buildLab2(w2);
  const fresh = exportSchem(w2);
  writeFileSync('examples/lab2.schem', fresh.buffer);
  writeFileSync('examples/lab2-cells.txt', JSON.stringify({ lever: lab.lever, box: lab.box, schemOrigin: fresh.origin, cells, events: probeEvents, falling }, null, 0));
  void out;
  console.log(`cells ${cells.length}, probes ${flat.length}, blocks ${w2.listBlocks().length}, schematic ${fresh.size.join('x')} origin ${fresh.origin.join(',')}, lever ${lab.lever.join(',')}, box ${lab.box.map((b) => b.join(',')).join(' .. ')}`);
}
