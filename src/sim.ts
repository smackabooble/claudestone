import { World } from './world.ts';
import type { Pos } from './dirs.ts';

export interface Spec {
  /** Blocks are placed in order, like a player building. */
  blocks: { pos: Pos; type: string; props?: Record<string, any> }[];
  /** Player actions: right-click a block at the given game tick. */
  script?: { tick: number; use: Pos }[];
  /** Values to watch. `prop` defaults to the block's natural output (lit/powered/power). */
  probes?: { name: string; pos: Pos; prop?: string }[];
  expect?: { tick: number; probe: string; equals: any }[];
  ticks: number;
}

export interface Result {
  timeline: string[];
  failures: string[];
  world: World;
}

const defaultProp = (w: World, p: Pos): string => {
  const t = w.get(p).type;
  return t === 'redstone_wire' ? 'power' : t === 'redstone_lamp' || t.includes('torch') ? 'lit' : 'powered';
};

export function simulate(spec: Spec): Result {
  const w = new World();
  for (const b of spec.blocks) w.place(b.pos, b.type, b.props);
  const probes = spec.probes ?? [];
  const last = new Map<string, any>();
  const history = new Map<string, any>(); // `${tick}:${probe}` -> value
  const timeline: string[] = [];

  const sample = (tick: number) => {
    for (const pr of probes) {
      const v = w.read(pr.pos, pr.prop ?? defaultProp(w, pr.pos));
      history.set(`${tick}:${pr.name}`, v);
      if (!last.has(pr.name) || last.get(pr.name) !== v) {
        timeline.push(`t=${tick} ${pr.name}=${v}`);
        last.set(pr.name, v);
      }
    }
  };

  sample(0);
  for (let t = 1; t <= spec.ticks; t++) {
    w.step(() => { for (const s of spec.script ?? []) if (s.tick === t) w.use(s.use); });
    sample(t);
  }
  const failures: string[] = [];
  for (const e of spec.expect ?? []) {
    const got = history.get(`${e.tick}:${e.probe}`);
    if (got !== e.equals) failures.push(`t=${e.tick} ${e.probe}: expected ${e.equals}, got ${got}`);
  }
  return { timeline, failures, world: w };
}
