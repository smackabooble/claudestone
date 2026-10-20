import type { Block } from './world.ts';
import { World } from './world.ts';
import type { Pos } from './dirs.ts';

export const LEGEND =
  '#stone g=glass X=obsidian s=slime R=redstone_block 0-f=wire power l/L=lever off/on b/B=button t/T=torch off/on ' +
  '^v<>=repeater (points to output) c/C=comparator o/O=observer p/P=piston S=sticky ==head ~=moving z/Z=lamp off/on ' +
  'H=hopper D=dropper N=dispenser K=chest/barrel ?=other';

const OUT: Record<string, string> = { north: '^', south: 'v', west: '<', east: '>' };
const OPP: Record<string, string> = { north: 'south', south: 'north', west: 'east', east: 'west' };

export function symbol(b: Block): string {
  const p = b.p;
  switch (b.type) {
    case 'air': return '.';
    case 'stone': return '#';
    case 'glass': return 'g';
    case 'obsidian': return 'X';
    case 'slime_block': return 's';
    case 'redstone_block': return 'R';
    case 'redstone_wire': return p.power.toString(16);
    case 'lever': return p.powered ? 'L' : 'l';
    case 'stone_button': return p.powered ? 'B' : 'b';
    case 'redstone_torch': case 'redstone_wall_torch': return p.lit ? 'T' : 't';
    case 'repeater': return OUT[OPP[p.facing]] ?? '?';
    case 'comparator': return p.powered ? 'C' : 'c';
    case 'observer': return p.powered ? 'O' : 'o';
    case 'piston': return p.extended ? 'P' : 'p';
    case 'sticky_piston': return 'S';
    case 'piston_head': return '=';
    case 'moving_piston': return '~';
    case 'redstone_lamp': return p.lit ? 'Z' : 'z';
    case 'hopper': return 'H';
    case 'dropper': return 'D';
    case 'dispenser': return 'N';
    case 'chest': case 'barrel': return 'K';
    default: return '?';
  }
}

/** ASCII render: one grid per y layer, rows = z (north at top), columns = x. */
export function render(w: World, min: Pos, max: Pos): string {
  const out: string[] = [];
  for (let y = min[1]; y <= max[1]; y++) {
    out.push(`y=${y}  (x ${min[0]}..${max[0]} →, z ${min[2]}..${max[2]} ↓)`);
    for (let z = min[2]; z <= max[2]; z++) {
      let row = '';
      for (let x = min[0]; x <= max[0]; x++) row += symbol(w.get([x, y, z]));
      out.push(row);
    }
    out.push('');
  }
  return out.join('\n');
}

/** Bounding box of all non-air blocks, or null when empty. */
export function bounds(w: World): { min: Pos; max: Pos } | null {
  const bl = w.listBlocks();
  if (!bl.length) return null;
  const min: Pos = [Infinity, Infinity, Infinity], max: Pos = [-Infinity, -Infinity, -Infinity];
  for (const b of bl) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.pos[i]); max[i] = Math.max(max[i], b.pos[i]); }
  return { min, max };
}
