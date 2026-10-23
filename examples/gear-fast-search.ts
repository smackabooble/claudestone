// layout check / search for the compact item side. usage: tsx examples/gear-fast-search.ts [cfg-json]
import { World } from '../src/world.ts';
import { Board, foreignNear } from './noglue-lib.ts';
import { buildItems, buildPlatform, DEFAULT_CFG, PAIRS, type Cfg, type Items } from './gear-fast-items.ts';
import type { Pos } from '../src/dirs.ts';

/** every pulse pin of the item side */
export function pulsePins(it: Items): Pos[] {
  const p: Pos[] = [it.fpB.pulseY, it.fpP.pulseX, it.fpP.pulseY, it.c2.PD, it.c2.PC, it.fpS0D.pulseX, it.fpS0D.pulseY, it.fpS0S.pulseX, it.fpS0S.pulseY, it.fpSD.pulseX, it.fpSD.pulseY, it.fpSAB.pulseX, it.fpSAB.pulseY, it.c3AB.pulseC, it.c3D.pulseC];
  for (const pr of PAIRS) { p.push(it.c1[pr.id].PD, it.c1[pr.id].PC, it.mod[pr.y].pulseC, it.mod[pr.x].pulseC); if (pr.id !== 'D') p.push(it.feed[pr.id].pulseX, it.feed[pr.id].pulseY); else p.push(it.feed.D.pulseX, it.feed.D.pulseY); }
  return p;
}
/** can a lane reach the pin from outside? (flood fill over cells that are free or reserved, 6-neighbourhood, escape = leaving the box around the machine) */
export function unreachablePins(b: Board, pins: Pos[]): number {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const k of b.occ.keys()) { const q = k.split(',').map(Number); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); } }
  let bad = 0;
  for (const pin of pins) {
    const net = b.tag(pin)?.net ?? '';
    const own = new Set<string>([net]);
    const okc = (c: Pos): boolean => {
      const t = b.tag(c); if (t && !(t.kind === 'reserve' && (t.net === net || net.startsWith(t.net ?? '\0')))) return false;
      const f = b.tag([c[0], c[1] - 1, c[2]]); if (f && f.kind !== 'wool') return false;
      return !foreignNear(b, c, net, undefined, own);
    };
    const seen = new Set<string>([pin.join(',')]); const q: Pos[] = [pin]; let esc = false;
    while (q.length && !esc && seen.size < 30000) {
      const c = q.pop()!;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
        const n: Pos = [c[0] + dx, c[1] + dy, c[2] + dz]; const k = n.join(',');
        if (seen.has(k)) continue;
        if (n[0] < lo[0] - 2 || n[0] > hi[0] + 2 || n[2] < lo[2] - 2 || n[2] > hi[2] + 2 || n[1] > hi[1] + 2 || n[1] < lo[1] - 2) { esc = true; break; }
        seen.add(k);
        if (okc(n)) q.push(n);
      }
    }
    if (!esc) bad++;
  }
  return bad;
}

export function tryCfg(cfg: Cfg): { ok: boolean; err?: string; hops?: Record<string, number>; bbox?: number[]; t?: number; unreachable?: number } {
  const t0 = Date.now();
  const w = new World(); const b = new Board(w);
  try {
    const it = buildItems(b, cfg);
    buildPlatform(b, it, cfg);
    const unreachable = unreachablePins(b, pulsePins(it));
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const k of b.occ.keys()) { const p = k.split(',').map(Number); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } }
    return { ok: true, hops: it.hops, bbox: [...lo, ...hi], t: Date.now() - t0, unreachable };
  } catch (e: any) { return { ok: false, err: String(e.message).slice(0, 200), t: Date.now() - t0 }; }
}
if (process.argv[1]?.endsWith('gear-fast-search.ts')) {
  const cfg = process.argv[2] ? { ...DEFAULT_CFG, ...JSON.parse(process.argv[2]) } : DEFAULT_CFG;
  const r = tryCfg(cfg);
  console.log(JSON.stringify(r));
}

export function score(r: ReturnType<typeof tryCfg>): number {
  if (!r.ok || !r.hops || !r.bbox) return 1e6;
  const h = r.hops;
  const trunk = Math.max((h.cvb0 ?? 0) + (h.cvb1 ?? 0), (h.cvb2 ?? 0) + (h.cvb3 ?? 0)) * 1.5;
  const mods = ['diamond_pickaxe', 'diamond_axe', 'diamond_shovel', 'diamond_chestplate', 'diamond_sword', 'diamond_leggings', 'diamond_boots', 'diamond_helmet'];
  const modMax = Math.max(...mods.map((m) => (h['cv' + m] ?? 0) + (h['cvo_' + m] ?? 0)));
  const sticks = Math.max((h.cvpD ?? 0) + (h.cvsPick ?? 0), (h.cvpD ?? 0) + (h.cvsAxe ?? 0), (h.cvpAB ?? 0) + (h.cvS0Sy ?? 0) + (h.cvsShovel ?? 0), (h.cvpAB ?? 0) + (h.cvS0Sy ?? 0) + (h.cvsSword ?? 0));
  const sum = Object.values(h).reduce((a, v) => a + v, 0);
  const vol = (r.bbox[3] - r.bbox[0] + 1) * (r.bbox[4] - r.bbox[1] + 1) * (r.bbox[5] - r.bbox[2] + 1);
  return 400 * (r.unreachable ?? 0) + trunk + modMax + sticks + 0.3 * sum + 0.5 * Math.cbrt(vol) + 0.3 * ((h.cvS0Dx ?? 0) + (h.cvS0Sx ?? 0));
}
