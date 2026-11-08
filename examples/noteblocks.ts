/**
 * NOTE BLOCK SONG PROTOTYPE: a song (list of note events on a 0.1 s = 1 redstone tick grid) -> a build -> played back in the simulator and checked tick by tick.
 *
 * TIMING. One lever level travels along a TIMELINE of repeaters (z=0, along +x). Every game tick of redstone is exact (2 gt per repeater tick): server lag slows the whole world
 * evenly and cannot shift one note against another (what lag does change is how the sound packets reach the client). A gap of g redstone ticks between two slots is
 * ceil(g/4) repeaters (delay 4 = 8 gt each), so silent passages cost almost nothing. At every occupied slot the timeline passes through a DUST TAP.
 *
 * FAN-OUT. A note block only sounds when the block ABOVE it is air and its power rises. So a dust line over the note blocks does not work. Instead every tap drives a COMB:
 *   a dust bus runs north and south from the tap (z = +-1 .. +-14); at every second bus cell (z = +-2, +-4 ...) a one-cell dust STUB goes sideways (x = +-1) and ENDS pointing at a
 *   note block (x = +-2) - a dust line end powers the block it points at. Stubs are two cells apart so they do not touch. Per tap: 2 sides x 7 rows x 2 note blocks = 28 notes
 *   from ONE pulse (more with a repeater in the bus: the dust range is 15). Direct alternatives: a repeater/observer back powers ONE block that touches at most 4 note blocks.
 *
 * The note blocks stand on the instrument block (vanilla: the block below decides the instrument) with the note (0..24 = F#3..F#5) in their state.
 */
import { World } from '../src/world.ts';
import type { Pos } from '../src/dirs.ts';

export interface NoteEv { t: number; note: number; inst: string }
export interface Song { events: NoteEv[] }

/** instrument -> block below the note block (vanilla) */
export const INST_BLOCK: Record<string, string> = {
  harp: 'dirt', bass: 'oak_planks', basedrum: 'stone', snare: 'sand', hat: 'glass', guitar: 'white_wool', bell: 'gold_block', flute: 'clay', chime: 'packed_ice',
  xylophone: 'bone_block', iron_xylophone: 'iron_block', cow_bell: 'soul_sand', didgeridoo: 'pumpkin', bit: 'emerald_block', banjo: 'hay_block', pling: 'glowstone',
};

export interface BuiltSong {
  lever: Pos;
  /** per occupied slot: time (redstone ticks), x of the tap, positions of its note blocks */
  slots: { t: number; x: number; notes: Pos[] }[];
  size: Pos;
  noteBlocks: number;
}

const MAX_SIDE = 7;                         // stub rows per side: bus length 14 (dust range 15)
export const NOTES_PER_TAP = 2 * MAX_SIDE * 2;

export type Mode = 'comb' | 'dense';
/** capacity of one tap: comb = 4 per bus row; dense = note blocks that touch a dust-powered note block are powered too (a weakly powered conductor powers adjacent components) */
export const capacity = (mode: Mode, rows = MAX_SIDE) => (mode === 'comb' ? 4 * rows : 12 * rows + 4);

/** cells of a tap in the order they are filled: [dx, dz, isSource]; sources stand at the stub ends (x=+-2, z=+-2r) */
function tapCells(mode: Mode, rows: number): [number, number, boolean][] {
  const quads: [number, number][] = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
  const out: [number, number, boolean][] = [];
  for (let r = 1; r <= rows; r++) for (const [sx, sz] of quads) out.push([2 * sx, 2 * r * sz, true]);
  if (mode === 'dense') {
    for (let r = 1; r <= rows; r++) for (const [sx, sz] of quads) out.push([3 * sx, 2 * r * sz, false]);
    for (let r = 1; r <= rows; r++) for (const [sx, sz] of quads) out.push([2 * sx, (2 * r + 1) * sz, false]);
    for (const [sx, sz] of quads) out.push([2 * sx, 1 * sz, false]);
  }
  return out;
}

export function buildSong(w: World, song: Song, origin: Pos, mode: Mode = 'comb'): BuiltSong {
  const [ox, oy, oz] = origin;                                   // oy = height of the dust / note blocks, oy-1 = instrument blocks, oy-2 = floor
  const slotsT = [...new Set(song.events.map((e) => e.t))].sort((a, b) => a - b);
  const put = (x: number, y: number, z: number, type: string, props: Record<string, any> = {}) => w.setRaw([ox + x, y, oz + z], type, props);
  // --- layout of the timeline: the lever at x=0, then for every slot [repeaters][dust bridge][tap]; taps are at least 5 apart (the comb is 5 wide) ---
  const taps: { t: number; x: number }[] = [];
  const row: { x: number; kind: 'rep' | 'dust'; delay?: number }[] = [];
  let prevT = 0, prevX = 0;
  for (const t of slotsT) {
    const gap = t - prevT;                                       // redstone ticks to wait before this slot (the first slot counts from the lever)
    const reps: number[] = [];
    for (let left = gap; left > 0; left -= 4) reps.push(Math.min(4, left));
    const pitch = mode === 'dense' ? 8 : 6;
    const tapX = Math.max(prevX + (taps.length ? pitch : 4), prevX + reps.length + 1);
    let cx = prevX + 1;
    for (const d of reps) { row.push({ x: cx, kind: 'rep', delay: d }); cx += 1; }
    while (cx < tapX) { row.push({ x: cx, kind: 'dust' }); cx += 1; }
    taps.push({ t, x: tapX }); prevT = t; prevX = tapX;
  }
  const xEnd = prevX + 4;
  // floor + lever
  const zMax = MAX_SIDE * 2 + 2;
  for (let xx = -2; xx <= xEnd; xx++) for (let z = -zMax; z <= zMax; z++) put(xx, oy - 2, z, 'light_gray_wool');
  put(0, oy - 1, 0, 'purple_wool');
  const lever: Pos = [ox - 0, oy, oz];
  w.setRaw(lever, 'lever', { face: 'floor', powered: false });
  // timeline cells (the dust at the tap cell and bridging dust need a floor: the obsidian plane at oy-2 is one lower, so put a support under every dust/repeater)
  for (let xx = 1; xx <= xEnd; xx++) put(xx, oy - 1, 0, 'yellow_wool');
  for (const c of row) {
    if (c.kind === 'rep') put(c.x, oy, 0, 'repeater', { facing: 'west', delay: c.delay, powered: false });     // input from the west = the lever side, output east
    else put(c.x, oy, 0, 'redstone_wire');
  }
  // taps and combs
  const slots: BuiltSong['slots'] = [];
  let nb = 0;
  for (const tap of taps) {
    put(tap.x, oy, 0, 'redstone_wire');
    const evs = song.events.filter((e) => e.t === tap.t);
    if (evs.length > capacity(mode)) throw new Error(`slot at t=${tap.t} has ${evs.length} notes, one tap drives at most ${capacity(mode)} (${mode})`);
    let rows = 1; while (capacity(mode, rows) < evs.length) rows++;
    const cells = tapCells(mode, rows);
    const notes: Pos[] = [];
    // bus + stubs for every row that is needed (a stub ends at the source cell of each quadrant; unused sources get a plain conductor so neighbours can be powered through them)
    for (const side of [1, -1]) for (let k = 1; k <= 2 * rows; k++) { put(tap.x, oy - 1, side * k, 'orange_wool'); put(tap.x, oy, side * k, 'redstone_wire'); }
    for (let r = 1; r <= rows; r++) for (const sx of [-1, 1]) for (const sz of [1, -1]) {
      put(tap.x + sx, oy - 1, 2 * r * sz, 'red_wool'); put(tap.x + sx, oy, 2 * r * sz, 'redstone_wire');
    }
    const used = new Set<string>();
    evs.forEach((e, i) => {
      const [dx, dz] = cells[i];
      put(tap.x + dx, oy - 1, dz, INST_BLOCK[e.inst] ?? 'dirt');
      put(tap.x + dx, oy, dz, 'note_block', { note: e.note, instrument: e.inst, powered: false });
      used.add(`${dx},${dz}`); notes.push([ox + tap.x + dx, oy, oz + dz]); nb++;
    });
    // every source of a used row that carries no note gets an obsidian conductor (dense mode: the neighbours are powered through it)
    for (const [dx, dz, src] of cells) if (src && !used.has(`${dx},${dz}`)) { if (mode === 'dense' && evs.length > 4 * rows) put(tap.x + dx, oy, dz, 'magenta_wool'); }
    slots.push({ t: tap.t, x: ox + tap.x, notes });
  }
  return { lever, slots, size: [xEnd + 3, 4, 2 * zMax + 1], noteBlocks: nb };
}

/** run the built song: pull the lever, return every sounded note as (game tick since the pull, note, instrument) */
export function playSong(w: World, built: BuiltSong, gt: number): { tick: number; note: number; instrument: string }[] {
  w.run(10);
  const t0 = w.time;
  w.notes.length = 0;
  w.use(built.lever);
  w.run(gt);
  return w.notes.map((n) => ({ tick: n.tick - t0, note: n.note, instrument: n.instrument })).sort((a, b) => a.tick - b.tick || a.note - b.note);
}
