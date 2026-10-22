import { World, type Block } from './world.ts';
import { bytes, comp, int, ints, short, writeNbt } from './nbtwrite.ts';
import type { Pos } from './dirs.ts';

const DATA_VERSION = 3465; // Minecraft 1.20.1

const kv = (o: Record<string, any>): string =>
  Object.keys(o).sort().map((k) => `${k}=${o[k]}`).join(',');

/** Engine block -> vanilla block state string. */
export function toBlockState(b: Block): string {
  const p = b.p;
  const st = (props: Record<string, any>) => `minecraft:${b.type}[${kv(props)}]`;
  switch (b.type) {
    case 'redstone_wire': return st({ east: p.east, north: p.north, power: p.power, south: p.south, west: p.west });
    case 'lever': case 'stone_button': return st({ face: p.face, facing: p.facing, powered: !!p.powered });
    case 'redstone_torch': return st({ lit: !!p.lit });
    case 'redstone_wall_torch': return st({ facing: p.facing, lit: !!p.lit });
    case 'repeater': return st({ delay: p.delay, facing: p.facing, locked: false, powered: !!p.powered });
    case 'comparator': return st({ facing: p.facing, mode: p.mode === 'subtract' ? 'subtract' : 'compare', powered: !!p.powered });
    case 'observer': return st({ facing: p.facing, powered: !!p.powered });
    case 'note_block': return st({ instrument: p.instrument ?? 'harp', note: p.note ?? 0, powered: !!p.powered });
    case 'leaves': return 'minecraft:oak_leaves[distance=1,persistent=true,waterlogged=false]';
    case 'pane': return `minecraft:glass_pane[east=${!!p.east},north=${!!p.north},south=${!!p.south},waterlogged=false,west=${!!p.west}]`;
    case 'target': return 'minecraft:target[power=0]';
    case 'stairs': return `minecraft:stone_brick_stairs[facing=${p.facing ?? 'north'},half=bottom,shape=${p.shape ?? 'straight'},waterlogged=false]`;
    case 'partial': return 'minecraft:stone_slab[type=bottom,waterlogged=false]';
    case 'campfire': return `minecraft:campfire[facing=${p.facing ?? 'north'},lit=false,signal_fire=${!!p.signal_fire},waterlogged=false]`;
    case 'leafblock': return `minecraft:spruce_leaves[distance=${p.distance ?? 7},persistent=true,waterlogged=false]`;
    case 'log': return 'minecraft:oak_log[axis=y]';
    case 'tripwire_hook': return `minecraft:tripwire_hook[attached=${!!p.attached},facing=${p.facing ?? 'north'},powered=${!!p.powered}]`;
    case 'composter': return `minecraft:composter[level=${p.level ?? 0}]`;
    case 'hay_block': return 'minecraft:hay_block[axis=y]';
    case 'piston': case 'sticky_piston': return st({ extended: !!p.extended, facing: p.facing });
    case 'piston_head': return st({ facing: p.facing, short: false, type: p.type === 'sticky' ? 'sticky' : 'normal' });
    case 'hopper': return st({ enabled: p.enabled !== false, facing: p.facing });
    case 'dropper': case 'dispenser': return st({ facing: p.facing, triggered: !!p.triggered });
    case 'redstone_lamp': return st({ lit: !!p.lit });
    case 'iron_door': return st({ facing: p.facing, half: p.half, hinge: 'left', open: !!p.open, powered: !!p.powered });
    case 'stone_pressure_plate': return st({ powered: !!p.powered });
    case 'chest': return st({ facing: 'north', type: 'single', waterlogged: false });
    case 'barrel': return st({ facing: 'up', open: false });
    case 'moving_piston': return 'minecraft:air';
    default: return `minecraft:${b.type}`;
  }
}

/** Sponge Schematic v2 (.schem) of everything in the world, normalised to the min corner. */
export function exportSchem(w: World): { buffer: Buffer; size: Pos; origin: Pos } {
  const bl = w.listBlocks().filter((b) => b.type !== 'moving_piston');
  if (!bl.length) throw new Error('world is empty');
  const min: Pos = [Infinity, Infinity, Infinity], max: Pos = [-Infinity, -Infinity, -Infinity];
  for (const b of bl) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.pos[i]); max[i] = Math.max(max[i], b.pos[i]); }
  const [W, H, L] = [max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1];
  const palette = new Map<string, number>([['minecraft:air', 0]]);
  const data = new Array<number>(W * H * L).fill(0);
  for (const b of bl) {
    const s = toBlockState({ type: b.type, p: b.props });
    if (!palette.has(s)) palette.set(s, palette.size);
    const [x, y, z] = [b.pos[0] - min[0], b.pos[1] - min[1], b.pos[2] - min[2]];
    data[(y * L + z) * W + x] = palette.get(s)!;
  }
  const out: number[] = [];
  for (let v of data) { while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; } out.push(v); }
  const pal: Record<string, ReturnType<typeof int>> = {};
  for (const [k, v] of palette) pal[k] = int(v);
  const buffer = writeNbt({
    Version: int(2), DataVersion: int(DATA_VERSION),
    Width: short(W), Height: short(H), Length: short(L),
    Offset: ints([0, 0, 0]), PaletteMax: int(palette.size),
    Palette: comp(pal), BlockData: bytes(out),
    Metadata: comp({ Name: { t: 'str', v: 'claudestone export' } }),
  });
  return { buffer, size: [W, H, L], origin: min };
}
