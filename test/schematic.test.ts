import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { loadSchematic } from '../src/schematic.ts';
import { World } from '../src/world.ts';

// --- tiny NBT writer for fixtures ---
type T = ['byte', number] | ['short', number] | ['int', number] | ['str', string] | ['bytes', number[]]
  | ['longs', bigint[]] | ['list', T[], string] | ['comp', Record<string, T>];
const id = { byte: 1, short: 2, int: 3, bytes: 7, str: 8, list: 9, comp: 10, longs: 12 } as const;
function payload(t: T): Buffer {
  switch (t[0]) {
    case 'byte': return Buffer.from([t[1] & 0xff]);
    case 'short': { const b = Buffer.alloc(2); b.writeInt16BE(t[1]); return b; }
    case 'int': { const b = Buffer.alloc(4); b.writeInt32BE(t[1]); return b; }
    case 'str': { const s = Buffer.from(t[1]); const b = Buffer.alloc(2); b.writeUInt16BE(s.length); return Buffer.concat([b, s]); }
    case 'bytes': { const b = Buffer.alloc(4); b.writeInt32BE(t[1].length); return Buffer.concat([b, Buffer.from(t[1])]); }
    case 'longs': { const b = Buffer.alloc(4); b.writeInt32BE(t[1].length); const l = Buffer.alloc(8 * t[1].length); t[1].forEach((v, i) => l.writeBigUInt64BE(BigInt.asUintN(64, v), 8 * i)); return Buffer.concat([b, l]); }
    case 'list': { const b = Buffer.alloc(5); b[0] = (id as any)[t[2]]; b.writeInt32BE(t[1].length, 1); return Buffer.concat([b, ...t[1].map(payload)]); }
    case 'comp': return Buffer.concat([...Object.entries(t[1]).map(([k, v]) => named(k, v)), Buffer.from([0])]);
  }
}
function named(k: string, t: T): Buffer {
  const name = payload(['str', k]);
  return Buffer.concat([Buffer.from([(id as any)[t[0]]]), name, payload(t)]);
}
const file = (root: Record<string, T>) => gzipSync(Buffer.concat([Buffer.from([10]), payload(['str', '']), payload(['comp', root])]));

test('.schem (Sponge v2) lever -> wire -> lamp runs', () => {
  // x: 0..3, y: 0..1, z: 0. Layer y=0 stone x4, layer y=1 lever, wire, wire, lamp
  const names = ['minecraft:air', 'minecraft:stone', 'minecraft:lever[face=floor,facing=north,powered=false]',
    'minecraft:redstone_wire[power=0]', 'minecraft:redstone_lamp[lit=false]'];
  const palette: Record<string, T> = {};
  names.forEach((n, i) => (palette[n] = ['int', i]));
  const data = [1, 1, 1, 1, 2, 3, 3, 4];
  const buf = file({
    Version: ['int', 2], Width: ['short', 4], Height: ['short', 2], Length: ['short', 1],
    Palette: ['comp', palette], BlockData: ['bytes', data],
  });
  const sch = loadSchematic(buf);
  assert.equal(sch.blocks.length, 8);
  const w = new World();
  for (const b of sch.blocks) w.place(b.pos, b.type, b.props);
  assert.equal(w.read([3, 1, 0], 'lit'), false);
  w.use([0, 1, 0]);
  assert.equal(w.read([3, 1, 0], 'lit'), true);
});

test('.litematic bit-packed palette decodes', () => {
  // palette of 5 entries -> 3 bits/entry; 2x1x2 region
  const entries: T[] = ['minecraft:air', 'minecraft:stone', 'minecraft:redstone_block', 'minecraft:obsidian', 'minecraft:glass']
    .map((n) => ['comp', { Name: ['str', n] }] as T);
  const idx = [1, 2, 3, 4];
  let packed = 0n;
  idx.forEach((v, i) => (packed |= BigInt(v) << BigInt(i * 3)));
  const buf = file({
    Regions: ['comp', { r: ['comp', {
      Position: ['comp', { x: ['int', 10], y: ['int', 5], z: ['int', 7] }],
      Size: ['comp', { x: ['int', 2], y: ['int', 1], z: ['int', 2] }],
      BlockStatePalette: ['list', entries, 'comp'],
      BlockStates: ['longs', [packed]],
    }] }],
  });
  const sch = loadSchematic(buf);
  const at = (x: number, z: number) => sch.blocks.find((b) => b.pos[0] === x && b.pos[2] === z)!.type;
  assert.deepEqual(sch.size, [2, 1, 2]);
  assert.equal(at(0, 0), 'stone');
  assert.equal(at(1, 0), 'redstone_block');
  assert.equal(at(0, 1), 'obsidian');
  assert.equal(at(1, 1), 'glass');
});
