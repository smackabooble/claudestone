import { gunzipSync } from 'node:zlib';

export type Tag = number | bigint | string | Tag[] | { [k: string]: Tag } | Int32Array | BigInt64Array | Uint8Array | Int8Array;

/** Minimal big-endian NBT reader (gzip optional). Returns the root compound's content. */
export function parseNbt(buf: Buffer): { [k: string]: Tag } {
  const data = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  let o = 0;
  const u8 = () => data[o++];
  const i16 = () => { const v = data.readInt16BE(o); o += 2; return v; };
  const i32 = () => { const v = data.readInt32BE(o); o += 4; return v; };
  const i64 = () => { const v = data.readBigInt64BE(o); o += 8; return v; };
  const str = () => { const n = data.readUInt16BE(o); o += 2; const s = data.toString('utf8', o, o + n); o += n; return s; };

  const read = (t: number): Tag => {
    switch (t) {
      case 1: return (data.readInt8(o++));
      case 2: return i16();
      case 3: return i32();
      case 4: return i64();
      case 5: { const v = data.readFloatBE(o); o += 4; return v; }
      case 6: { const v = data.readDoubleBE(o); o += 8; return v; }
      case 7: { const n = i32(); const v = new Int8Array(data.subarray(o, o + n)); o += n; return v; }
      case 8: return str();
      case 9: { const it = u8(); const n = i32(); const a: Tag[] = []; for (let i = 0; i < n; i++) a.push(read(it)); return a; }
      case 10: {
        const c: { [k: string]: Tag } = {};
        for (let nt = u8(); nt !== 0; nt = u8()) { const k = str(); c[k] = read(nt); }
        return c;
      }
      case 11: { const n = i32(); const v = new Int32Array(n); for (let i = 0; i < n; i++) v[i] = i32(); return v; }
      case 12: { const n = i32(); const v = new BigInt64Array(n); for (let i = 0; i < n; i++) v[i] = i64(); return v; }
      default: throw new Error(`bad NBT tag ${t}`);
    }
  };
  if (u8() !== 10) throw new Error('NBT root must be a compound');
  str();
  return read(10) as { [k: string]: Tag };
}
