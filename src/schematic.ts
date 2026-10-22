import { parseNbt, type Tag } from './nbt.ts';
import type { Pos } from './dirs.ts';

export interface SpecBlock { pos: Pos; type: string; props?: Record<string, any>; soft?: boolean; /** original vanilla name when the block was approximated */ orig?: string }
export interface SpecItems { pos: Pos; items: { slot: number; id: string; count: number }[] }
export interface Loaded { blocks: SpecBlock[]; size: Pos; warnings: string[]; /** container contents from the file's tile entities (litematic only) */ items?: SpecItems[] }

type C = { [k: string]: Tag };
const num = (v: Tag): number => Number(v as number | bigint);

const DIRECT = new Set([
  'stone', 'tripwire_hook', 'composter', 'log', 'leafblock', 'hay_block', 'target', 'pane', 'glass', 'obsidian', 'furnace', 'leaves', 'partial', 'campfire', 'stairs', 'slime_block', 'redstone_wire', 'redstone_block', 'lever', 'repeater',
  'comparator', 'observer', 'redstone_torch', 'redstone_wall_torch', 'redstone_lamp', 'piston',
  'sticky_piston', 'hopper', 'dropper', 'dispenser', 'chest', 'barrel', 'stone_button', 'honey_block', 'tnt', 'stone_pressure_plate',
]);
const AIR = new Set(['air', 'cave_air', 'void_air']);
const SKIP = new Set(['moving_piston']);

const parseVal = (v: string): any => (v === 'true' ? true : v === 'false' ? false : /^-?\d+$/.test(v) ? Number(v) : v);

/** Map a vanilla block state onto an engine block. Returns null for air/skipped blocks. */
export function convertState(full: string, warn: (m: string) => void): { type: string; props: Record<string, any>; orig?: string } | null {
  const m = /^(?:minecraft:)?([a-z0-9_]+)(?:\[(.*)\])?$/.exec(full);
  if (!m) { warn(`unparsable block state ${full}`); return null; }
  const name = m[1];
  const raw: Record<string, any> = {};
  if (m[2]) for (const kv of m[2].split(',')) { const [k, v] = kv.split('='); raw[k] = parseVal(v); }
  if (AIR.has(name) || SKIP.has(name)) return null;
  const keep = (...ks: string[]) => Object.fromEntries(ks.filter((k) => k in raw).map((k) => [k, raw[k]]));
  switch (name) {
    case 'redstone_wire': return { type: name, props: keep('power', 'north', 'east', 'south', 'west') };
    case 'piston_head': return { type: name, props: keep('facing', 'type') };
    case 'iron_door': return raw.half === 'upper' ? null : { type: name, props: keep('facing') };
    case 'lever': return { type: name, props: keep('face', 'facing', 'powered') };
    case 'repeater': return { type: name, props: keep('facing', 'delay', 'powered') };
    case 'comparator': return { type: name, props: keep('facing', 'mode', 'powered') };
    case 'observer': return { type: name, props: keep('facing', 'powered') };
    case 'note_block': return { type: name, props: keep('note', 'instrument', 'powered') };
    case 'redstone_torch': return { type: name, props: keep('lit') };
    case 'redstone_wall_torch': return { type: name, props: keep('facing', 'lit') };
    case 'redstone_lamp': return { type: name, props: keep('lit') };
    case 'piston': case 'sticky_piston': return { type: name, props: keep('facing', 'extended') };
    case 'hopper': return { type: name, props: keep('facing', 'enabled') };
    case 'dropper': case 'dispenser': return { type: name, props: keep('facing', 'triggered') };
    default:
      if (/_button$/.test(name)) {
        if (name !== 'stone_button' && name !== 'polished_blackstone_button') warn(`${name} treated as stone_button (20-tick press)`);
        return { type: 'stone_button', props: keep('face', 'facing', 'powered') };
      }
      if (name === 'tripwire_hook') return { type: 'tripwire_hook', props: { facing: raw.facing ?? 'north', powered: raw.powered === true, attached: raw.attached === true }, orig: name };
      if (name === 'composter') return { type: 'composter', props: { level: Number(raw.level ?? 0) }, orig: name };
      if (name === 'hay_block') return { type: 'hay_block', props: {}, orig: name };
      if (DIRECT.has(name)) return { type: name, props: {} };
      if (/glass_pane$|^iron_bars$/.test(name)) return { type: 'pane', props: { north: raw.north === true, east: raw.east === true, south: raw.south === true, west: raw.west === true }, orig: name };
      if (/glass/.test(name)) return { type: 'glass', props: {} };
      // shape/behaviour classes (what matters for redstone + pistons): leaves = full support but no power conduction;
      // partial = not a full block (slabs, stairs, rails, composter ...): cannot hold dust, does not conduct
      if (/_leaves$/.test(name)) return { type: 'leafblock', props: { distance: Number(raw.distance ?? 7) }, orig: name };
      if (/_(log|wood)$/.test(name) || /^stripped_.*_(log|wood)$/.test(name)) return { type: 'log', props: {}, orig: name };
      if (name === 'campfire' || name === 'soul_campfire') { warn(`${name} treated as campfire (block entity, partial)`); return { type: 'campfire', props: { facing: raw.facing ?? 'north', signal_fire: raw.signal_fire === true }, orig: name }; }
      // top slabs / upside-down stairs have a FULL top face (dust can sit on them) but do not conduct; double slabs are full blocks
      if (/_slab$/.test(name) && raw.type === 'double') return { type: 'stone', props: {}, orig: name };
      if ((/_slab$/.test(name) && raw.type === 'top') || (/_stairs$/.test(name) && raw.half === 'top')) {
        warn(`${name}[top] treated as leaves (supports dust on top, does not conduct)`);
        return { type: 'leaves', props: {}, orig: name };
      }
      if (/_stairs$/.test(name)) { warn(`${name} imported as a bottom stair (shape follows neighbouring stairs, observers see shape changes)`); return { type: 'stairs', props: { facing: raw.facing ?? 'north', half: 'bottom', shape: raw.shape ?? 'straight' }, orig: name }; }
      if (/_(slab|carpet|trapdoor|wall|fence|fence_gate|button|pressure_plate)$|(^|_)rail$|^(cauldron|lectern|flower_pot|snow)$/.test(name)) {
        warn(`${name} treated as a partial block (no dust support, no conduction)`);
        return { type: 'partial', props: {}, orig: name };
      }
      warn(`unsupported block ${name} treated as stone`);
      return { type: 'stone', props: {}, orig: name };
  }
}

const isSupport = (t: string) => ['stone', 'glass', 'obsidian', 'slime_block', 'redstone_block', 'redstone_lamp', 'observer', 'dropper', 'dispenser', 'barrel', 'piston', 'sticky_piston', 'honey_block', 'tnt'].includes(t);

function order(blocks: SpecBlock[]): SpecBlock[] {
  const cmp = (a: SpecBlock, b: SpecBlock) => a.pos[1] - b.pos[1] || a.pos[2] - b.pos[2] || a.pos[0] - b.pos[0];
  const support = blocks.filter((b) => isSupport(b.type)).sort(cmp);
  const rest = blocks.filter((b) => !isSupport(b.type)).sort(cmp);
  return [...support, ...rest];
}

function counted(warnings: string[]): (m: string) => void {
  const seen = new Set<string>();
  return (m) => { if (!seen.has(m)) { seen.add(m); warnings.push(m); } };
}

function fromSponge(root: C, warnings: string[]): Loaded {
  const warn = counted(warnings);
  const sch = (root.Schematic as C | undefined) ?? root;
  const W = num(sch.Width), H = num(sch.Height), L = num(sch.Length);
  const blocksTag = (sch.Blocks as C | undefined) ?? sch;
  const palette = blocksTag.Palette as C;
  const data = (blocksTag.Data ?? blocksTag.BlockData) as Int8Array;
  const byIdx: string[] = [];
  for (const [name, idx] of Object.entries(palette)) byIdx[num(idx)] = name;
  const out: SpecBlock[] = [];
  let o = 0;
  for (let i = 0; i < W * H * L; i++) {
    let v = 0, shift = 0, b: number;
    do { b = data[o++] & 0xff; v |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    const c = convertState(byIdx[v], warn);
    if (!c) continue;
    const x = i % W, z = Math.floor(i / W) % L, y = Math.floor(i / (W * L));
    out.push({ pos: [x, y, z], type: c.type, props: c.props, soft: true, orig: c.orig });
  }
  return { blocks: order(out), size: [W, H, L], warnings };
}

function fromLitematic(root: C, warnings: string[]): Loaded {
  const warn = counted(warnings);
  const out: SpecBlock[] = [];
  const regions = root.Regions as C;
  let min: Pos = [Infinity, Infinity, Infinity], max: Pos = [-Infinity, -Infinity, -Infinity];
  const parsed: { pos: Pos; type: string; props: Record<string, any>; orig?: string }[] = [];
  const rawItems: SpecItems[] = [];
  for (const reg of Object.values(regions) as C[]) {
    const P = reg.Position as C, S = reg.Size as C;
    const sx = num(S.x), sy = num(S.y), sz = num(S.z);
    const ax = Math.abs(sx), ay = Math.abs(sy), az = Math.abs(sz);
    const ox = num(P.x) + (sx < 0 ? sx + 1 : 0), oy = num(P.y) + (sy < 0 ? sy + 1 : 0), oz = num(P.z) + (sz < 0 ? sz + 1 : 0);
    for (const te of ((reg.TileEntities as C[] | undefined) ?? [])) {
      const its = ((te.Items as C[] | undefined) ?? []).map((it) => ({ slot: num(it.Slot ?? it.slot ?? 0), id: String(it.id ?? it.Id).replace(/^minecraft:/, ''), count: num(it.count ?? it.Count ?? 1) }));
      if (its.length) rawItems.push({ pos: [ox + num(te.x), oy + num(te.y), oz + num(te.z)], items: its });
    }
    const pal = (reg.BlockStatePalette as C[]).map((e) => {
      const props = e.Properties as C | undefined;
      const ps = props ? Object.entries(props).map(([k, v]) => `${k}=${v}`).join(',') : '';
      return `${e.Name}${ps ? `[${ps}]` : ''}`;
    });
    const bits = Math.max(2, Math.ceil(Math.log2(pal.length)));
    const longs = reg.BlockStates as BigInt64Array;
    const mask = (1n << BigInt(bits)) - 1n;
    const total = ax * ay * az;
    for (let i = 0; i < total; i++) {
      const bit = BigInt(i * bits);
      const li = Number(bit >> 6n), off = bit & 63n;
      let v = BigInt.asUintN(64, longs[li]) >> off;
      if (off + BigInt(bits) > 64n) v |= BigInt.asUintN(64, longs[li + 1]) << (64n - off);
      const idx = Number(v & mask);
      const c = convertState(pal[idx], warn);
      if (!c) continue;
      const x = ox + (i % ax), z = oz + (Math.floor(i / ax) % az), y = oy + Math.floor(i / (ax * az));
      parsed.push({ pos: [x, y, z], type: c.type, props: c.props, orig: c.orig });
      min = [Math.min(min[0], x), Math.min(min[1], y), Math.min(min[2], z)];
      max = [Math.max(max[0], x), Math.max(max[1], y), Math.max(max[2], z)];
    }
  }
  for (const b of parsed) out.push({ ...b, pos: [b.pos[0] - min[0], b.pos[1] - min[1], b.pos[2] - min[2]], soft: true });
  const items = rawItems.map((r) => ({ ...r, pos: [r.pos[0] - min[0], r.pos[1] - min[1], r.pos[2] - min[2]] as Pos }));
  return { blocks: order(out), size: parsed.length ? [max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1] : [0, 0, 0], warnings, items };
}

/** Load a .schem (Sponge v2/v3) or .litematic file. */
export function loadSchematic(buf: Buffer): Loaded {
  const root = parseNbt(buf);
  const warnings: string[] = [];
  if (root.Regions) return fromLitematic(root, warnings);
  return fromSponge(root, warnings);
}
