// layout check / search for the compact item side. usage: tsx examples/gear-fast-search.ts [cfg-json]
import { World } from '../src/world.ts';
import { Board } from './noglue-lib.ts';
import { buildItems, DEFAULT_CFG, type Cfg } from './gear-fast-items.ts';

export function tryCfg(cfg: Cfg): { ok: boolean; err?: string; hops?: Record<string, number>; bbox?: number[]; t?: number } {
  const t0 = Date.now();
  const w = new World(); const b = new Board(w);
  try {
    const it = buildItems(b, cfg);
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const k of b.occ.keys()) { const p = k.split(',').map(Number); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } }
    return { ok: true, hops: it.hops, bbox: [...lo, ...hi], t: Date.now() - t0 };
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
  const trunk = (h.cvb0 ?? 0) + (h.cvb1 ?? 0) + (h.cvb2 ?? 0) + (h.cvb3 ?? 0);
  const mods = ['diamond_pickaxe', 'diamond_axe', 'diamond_shovel', 'diamond_chestplate', 'diamond_sword', 'diamond_leggings', 'diamond_boots', 'diamond_helmet'];
  const modMax = Math.max(...mods.map((m) => (h['cv' + m] ?? 0) + (h['cvo_' + m] ?? 0)));
  const sticks = Math.max((h.cvpD ?? 0) + (h.cvsPick ?? 0), (h.cvpD ?? 0) + (h.cvsAxe ?? 0), (h.cvpAB ?? 0) + (h.cvS0Sy ?? 0) + (h.cvsShovel ?? 0), (h.cvpAB ?? 0) + (h.cvS0Sy ?? 0) + (h.cvsSword ?? 0));
  const sum = Object.values(h).reduce((a, v) => a + v, 0);
  const vol = (r.bbox[3] - r.bbox[0] + 1) * (r.bbox[4] - r.bbox[1] + 1) * (r.bbox[5] - r.bbox[2] + 1);
  return trunk + modMax + sticks + 0.3 * sum + 0.5 * Math.cbrt(vol) + 0.3 * ((h.cvS0Dx ?? 0) + (h.cvS0Sx ?? 0));
}
