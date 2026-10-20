import { gzipSync } from 'node:zlib';

export type W =
  | { t: 'byte' | 'short' | 'int'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bytes'; v: number[] }
  | { t: 'comp'; v: Record<string, W> }
  | { t: 'ints'; v: number[] };

export const byte = (v: number): W => ({ t: 'byte', v });
export const short = (v: number): W => ({ t: 'short', v });
export const int = (v: number): W => ({ t: 'int', v });
export const str = (v: string): W => ({ t: 'str', v });
export const bytes = (v: number[]): W => ({ t: 'bytes', v });
export const ints = (v: number[]): W => ({ t: 'ints', v });
export const comp = (v: Record<string, W>): W => ({ t: 'comp', v });

const ID = { byte: 1, short: 2, int: 3, bytes: 7, str: 8, comp: 10, ints: 11 } as const;

function payload(w: W): Buffer {
  switch (w.t) {
    case 'byte': return Buffer.from([w.v & 0xff]);
    case 'short': { const b = Buffer.alloc(2); b.writeInt16BE(w.v); return b; }
    case 'int': { const b = Buffer.alloc(4); b.writeInt32BE(w.v); return b; }
    case 'str': { const s = Buffer.from(w.v, 'utf8'); const b = Buffer.alloc(2); b.writeUInt16BE(s.length); return Buffer.concat([b, s]); }
    case 'bytes': { const b = Buffer.alloc(4); b.writeInt32BE(w.v.length); return Buffer.concat([b, Buffer.from(w.v)]); }
    case 'ints': { const b = Buffer.alloc(4 + 4 * w.v.length); b.writeInt32BE(w.v.length); w.v.forEach((x, i) => b.writeInt32BE(x, 4 + 4 * i)); return b; }
    case 'comp': return Buffer.concat([...Object.entries(w.v).map(([k, v]) => named(k, v)), Buffer.from([0])]);
  }
}
function named(k: string, w: W): Buffer {
  return Buffer.concat([Buffer.from([ID[w.t]]), payload(str(k)), payload(w)]);
}

/** Gzipped NBT file with an unnamed root compound. */
export function writeNbt(root: Record<string, W>): Buffer {
  return gzipSync(Buffer.concat([Buffer.from([10]), payload(str('')), payload(comp(root))]));
}
