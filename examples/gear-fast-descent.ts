// coordinate descent over the cluster positions of the compact item side (background job). usage: tsx examples/gear-fast-descent.ts [minutes=30]
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { DEFAULT_CFG, type Cfg } from './gear-fast-items.ts';
import { tryCfg, score } from './gear-fast-search.ts';

const FILE = new URL('../.cache/fast-cfg.json', import.meta.url);
let cfg: Cfg = existsSync(FILE) ? { ...DEFAULT_CFG, ...JSON.parse(readFileSync(FILE, 'utf8')) } : structuredClone(DEFAULT_CFG);
const budget = Number(process.argv[2] ?? 30) * 60_000, t0 = Date.now();
let best = score(tryCfg(cfg));
console.log('start score', best.toFixed(1));
const clusters: (keyof Cfg)[] = ['fpB', 'fpP', 'fpSD', 'fpS0S', 'fpSAB', 'leftover'];
const steps = [16, 8, 4, 2, 1];
const save = () => { mkdirSync(new URL('../.cache/', import.meta.url), { recursive: true }); writeFileSync(FILE, JSON.stringify(cfg)); };
let improved = true;
while (improved && Date.now() - t0 < budget) {
  improved = false;
  for (const step of steps) {
    for (const key of clusters) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
        if (Date.now() - t0 > budget) break;
        if (dy !== 0 && step > 3) continue;
        const cur = cfg[key] as number[];
        const next = structuredClone(cfg); (next[key] as number[]) = [cur[0] + dx * step, cur[1] + dy * step, cur[2] + dz * step];
        const s = score(tryCfg(next));
        if (s < best - 0.01) { best = s; cfg = next; improved = true; save(); console.log(key, JSON.stringify(next[key]), 'step', step, 'score', s.toFixed(1)); }
      }
    }
    // module offsets and shaft
    for (const [key, d] of [['modDX', 1], ['modDX', -1], ['modYz', 1], ['modYz', -1], ['modXz', 1], ['modXz', -1]] as const) {
      if (Date.now() - t0 > budget) break;
      const next = structuredClone(cfg) as any; next[key] = (cfg as any)[key] + d;
      const s = score(tryCfg(next)); if (s < best - 0.01) { best = s; cfg = next; improved = true; save(); console.log(key, next[key], 'score', s.toFixed(1)); }
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      if (Date.now() - t0 > budget) break;
      const next = structuredClone(cfg); next.shaft = [cfg.shaft[0] + dx, cfg.shaft[1] + dz];
      const s = score(tryCfg(next)); if (s < best - 0.01) { best = s; cfg = next; improved = true; save(); console.log('shaft', JSON.stringify(next.shaft), 'score', s.toFixed(1)); }
    }
  }
}
console.log('done', best.toFixed(1), JSON.stringify(cfg));
