/**
 * Item entities and water for the sim (vanilla 1.20 rules, simplified): droppers throw real items, water pushes them (flow vectors, buoyancy),
 * soul-sand bubble columns lift them, blocks stop them, hoppers pick them up. Only what item lifts need: still, treat the result as a good model,
 * not as proof (see ACCURACY.md).
 */
import type { Pos } from './dirs.ts';

export interface ItemEnt { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; item: { id: string; count: number }; age: number; onGround: boolean }

const W = 0.25, H = 0.25;      // item entity box
const SRC = 8 / 9;

export interface WorldLike {
  get(p: Pos): { type: string; p: Record<string, any> };
  ents3: ItemEnt[];
  solidForItems(p: Pos): boolean;
}

function waterH(w: WorldLike, p: Pos): number {
  const b = w.get(p);
  if (b.type !== 'water') return 0;
  const l = b.p.level ?? 0;
  return l >= 8 ? SRC : (8 - l) / 9;
}
const isWater = (w: WorldLike, p: Pos) => w.get(p).type === 'water';

/** a source water cell over soul sand (or over another column cell) is a bubble column */
export function isColumn(w: WorldLike, p: Pos): boolean {
  for (let y = p[1]; ; y--) {
    const b = w.get([p[0], y, p[2]]);
    if (b.type === 'water' && (b.p.level ?? 0) === 0) { if (w.get([p[0], y - 1, p[2]]).type === 'soul_sand') return true; continue; }
    return false;
  }
}

/** vanilla FlowingFluid.getFlow (horizontal part) */
export function flowOf(w: WorldLike, p: Pos): [number, number] {
  const own = waterH(w, p);
  let vx = 0, vz = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n: Pos = [p[0] + dx, p[1], p[2] + dz];
    let f = waterH(w, n), g = 0;
    if (f === 0) {
      if (!w.solidForItems(n)) {
        const bf = waterH(w, [n[0], n[1] - 1, n[2]]);
        if (bf > 0) g = own - (bf - 0.8888889);
      }
    } else g = own - f;
    if (g !== 0) { vx += dx * g; vz += dz * g; }
  }
  const l = Math.hypot(vx, vz);
  return l > 0 ? [vx / l, vz / l] : [0, 0];
}

/** move the box with block collisions (cubes only), axis by axis: y, x, z */
function move(w: WorldLike, e: ItemEnt): void {
  const hit = (x: number, y: number, z: number): boolean => {
    const x0 = Math.floor(x - W / 2 + 1e-9), x1 = Math.floor(x + W / 2 - 1e-9), y0 = Math.floor(y + 1e-9), y1 = Math.floor(y + H - 1e-9), z0 = Math.floor(z - W / 2 + 1e-9), z1 = Math.floor(z + W / 2 - 1e-9);
    for (let a = x0; a <= x1; a++) for (let b = y0; b <= y1; b++) for (let c = z0; c <= z1; c++) if (w.solidForItems([a, b, c])) return true;
    return false;
  };
  const axis = (d: number, set: (v: number) => void, get: () => number): boolean => {
    if (d === 0) return false;
    const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.1)), st = d / steps;
    for (let i = 0; i < steps; i++) { const o = get(); set(o + st); if (hit(e.x, e.y, e.z)) { set(o); return true; } }
    return false;
  };
  e.onGround = false;
  if (axis(e.vy, (v) => { e.y = v; }, () => e.y)) { if (e.vy < 0) e.onGround = true; e.vy = 0; }
  if (axis(e.vx, (v) => { e.x = v; }, () => e.x)) e.vx = 0;
  if (axis(e.vz, (v) => { e.z = v; }, () => e.z)) e.vz = 0;
}

export function stepEntity(w: WorldLike, e: ItemEnt): void {
  e.age++;
  // fluid pushing (Entity.updateFluidHeightAndDoFluidPushing)
  const x0 = Math.floor(e.x - W / 2 + 1e-3), x1 = Math.floor(e.x + W / 2 - 1e-3), z0 = Math.floor(e.z - W / 2 + 1e-3), z1 = Math.floor(e.z + W / 2 - 1e-3);
  const y0 = Math.floor(e.y + 1e-3), y1 = Math.floor(e.y + H - 1e-3);
  let fluidH = 0, fx = 0, fz = 0, n = 0;
  for (let a = x0; a <= x1; a++) for (let b = y0; b <= y1; b++) for (let c = z0; c <= z1; c++) {
    const p: Pos = [a, b, c]; const h = waterH(w, p);
    if (h === 0) continue;
    const top = b + h;                                                        // a full cell below is full height
    const surface = isWater(w, [a, b + 1, c]) ? b + 1 : top;
    if (surface >= e.y) {
      fluidH = Math.max(fluidH, surface - e.y);
      const [gx, gz] = flowOf(w, p); fx += gx; fz += gz; n++;
    }
  }
  if (n > 0 && (fx !== 0 || fz !== 0)) {
    const l = Math.hypot(fx, fz); let px = (fx / l) * 0.014, pz = (fz / l) * 0.014;
    if (Math.abs(e.vx) < 0.003 && Math.abs(e.vz) < 0.003 && Math.hypot(px, pz) < 0.0045) { px = (px / Math.hypot(px, pz)) * 0.0045; pz = (pz / Math.hypot(px, pz)) * 0.0045; }
    e.vx += px; e.vz += pz;
  }
  // ItemEntity.tick: underwater buoyancy or gravity
  if (fluidH > 0.1) { e.vx *= 0.99; e.vz *= 0.99; e.vy += e.vy < 0.06 ? 5e-4 : 0; }
  else e.vy -= 0.04;
  if (!e.onGround || Math.hypot(e.vx, e.vz) > 1e-2 || (e.age + e.id) % 4 === 0) move(w, e);
  // bubble columns (BubbleColumnBlock.entityInside)
  const cx0 = Math.floor(e.x), cz0 = Math.floor(e.z);
  for (let b = Math.floor(e.y + 1e-3); b <= Math.floor(e.y + H - 1e-3); b++) {
    if (isColumn(w, [cx0, b, cz0])) {
      const aboveFree = !w.solidForItems([cx0, b + 1, cz0]) && !isWater(w, [cx0, b + 1, cz0]);
      e.vy = aboveFree ? Math.min(1.8, e.vy + 0.1) : Math.min(0.7, e.vy + 0.06);
      break;
    }
  }
  const f = e.onGround ? 0.6 * 0.98 : 0.98;
  e.vx *= f; e.vz *= f; e.vy *= 0.98;
  if (e.onGround && e.vy < 0) e.vy *= -0.5;
}

/** an item entity overlaps the pickup box of the hopper at p (its top 5/16 and the cell above) */
export function itemsAtHopper(w: WorldLike, p: Pos): ItemEnt[] {
  return w.ents3.filter((e) => e.x + W / 2 > p[0] && e.x - W / 2 < p[0] + 1 && e.z + W / 2 > p[2] && e.z - W / 2 < p[2] + 1 && e.y + H > p[1] + 0.6875 && e.y < p[1] + 2);
}
