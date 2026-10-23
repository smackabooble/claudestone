/**
 * Small build library for the glue-free 4x4 door: an occupancy-checked board (so two parts never overwrite each other)
 * and a dust router (A* on a 3D grid, dust staircases, keep-out around other nets) with exact-delay booster assignment.
 */
import { World } from '../src/world.ts';
import type { Dir, Pos } from '../src/dirs.ts';

export const OPP: Record<Dir, Dir> = { east: 'west', west: 'east', north: 'south', south: 'north', up: 'down', down: 'up' };
const HDIRS: [number, number, Dir][] = [[1, 0, 'east'], [-1, 0, 'west'], [0, 1, 'south'], [0, -1, 'north']];
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const keyOf = (p: Pos) => key(p[0], p[1], p[2]);

export type Kind = 'wool' | 'dust' | 'rep' | 'cmp' | 'obs' | 'piston' | 'other' | 'clear' | 'lever';
export interface Tag { kind: Kind; net?: string }
const CONNECTIVE: Kind[] = ['dust', 'rep', 'cmp', 'obs', 'piston', 'lever'];

export class Board {
  w: World;
  occ = new Map<string, Tag>();
  floorColor = 'light_gray';
  constructor(w: World) { this.w = w; }
  tag(p: Pos): Tag | undefined { return this.occ.get(keyOf(p)); }
  isFree(p: Pos): boolean { return !this.occ.has(keyOf(p)); }
  /** wool block: may be placed again over an existing wool block (floors are shared) */
  wool(p: Pos, color = this.floorColor): void {
    const t = this.tag(p);
    if (t) { if (t.kind === 'wool') return; throw new Error(`wool ${p.join(',')}: cell occupied by ${t.kind}`); }
    this.occ.set(keyOf(p), { kind: 'wool' });
    this.w.place(p, `${color}_wool`);
  }
  private put(p: Pos, kind: Kind, net: string | undefined, type: string, props: Record<string, any>): void {
    const t = this.tag(p);
    if (t && !(t.kind === 'clear')) throw new Error(`${type} at ${p.join(',')}: cell occupied by ${t.kind}${t.net ? ' (' + t.net + ')' : ''}`);
    this.occ.set(keyOf(p), { kind, net });
    this.w.place(p, type, props);
  }
  /** block that is placed bare (pistons etc.); no floor */
  raw(p: Pos, type: string, props: Record<string, any> = {}, kind: Kind = 'other', net?: string): void { this.put(p, kind, net, type, props); }
  dust(p: Pos, net: string, floor = this.floorColor): void {
    this.wool([p[0], p[1] - 1, p[2]], floor);
    this.put(p, 'dust', net, 'redstone_wire', {});
  }
  /** flow = direction the signal travels (repeater output side) */
  rep(p: Pos, flow: Dir, delay: number, net: string, floor = this.floorColor): void {
    this.wool([p[0], p[1] - 1, p[2]], floor);
    this.put(p, 'rep', net, 'repeater', { facing: OPP[flow], delay });
  }
  cmp(p: Pos, flow: Dir, net: string, floor = this.floorColor, mode = 'subtract'): void {
    this.wool([p[0], p[1] - 1, p[2]], floor);
    this.put(p, 'cmp', net, 'comparator', { facing: OPP[flow], mode });
  }
  /** observer watching the cell in direction `watch`; it outputs on the opposite side */
  obs(p: Pos, watch: Dir, net: string): void { this.put(p, 'obs', net, 'observer', { facing: watch }); }
  /** reserve a cell that has to stay empty (air) */
  clear(p: Pos): void { if (this.isFree(p)) this.occ.set(keyOf(p), { kind: 'clear' }); }
}

const connective = (t: Tag | undefined, net: string, own?: Set<string>): boolean => !!t && CONNECTIVE.includes(t.kind) && t.net !== net && !(own && t.net && own.has(t.net));

export interface RouteOpts { floor?: string; allow?: Set<string>; maxNodes?: number; own?: string[] }

/** keep-out test: is there a foreign connective part within the 3x3x3 neighbourhood of c? */
function foreignNear(b: Board, c: Pos, net: string, allow?: Set<string>, own?: Set<string>): boolean {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    if (!dx && !dy && !dz) continue;
    const k = key(c[0] + dx, c[1] + dy, c[2] + dz);
    if (allow?.has(k)) continue;
    if (connective(b.occ.get(k), net, own)) return true;
  }
  // quasi-connectivity: droppers / crafters / pistons ('__q') also react to power around the cell ABOVE them -> keep a wider berth
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -3; dy <= 0; dy++) {
    if (allow?.has(key(c[0] + dx, c[1] + dy, c[2] + dz))) continue;
    const t = b.occ.get(key(c[0] + dx, c[1] + dy, c[2] + dz));
    if (t && t.net === '__q' && net !== '__q') return true;
  }
  return false;
}

/** Route dust from the dust cell `from` to the dust cell `to` (both already placed, net `net`). Returns the full cell list. */
export function route(b: Board, from: Pos, to: Pos, net: string, o: RouteOpts = {}): Pos[] {
  const goal = keyOf(to);
  const ownSet = new Set(o.own ?? []);
  const floorOk = (c: Pos) => { const t = b.tag([c[0], c[1] - 1, c[2]]); return !t || t.kind === 'wool'; };
  const free = (c: Pos) => b.isFree(c);
  type N = { c: Pos; g: number; f: number; prev?: N; k: string };
  const open: N[] = []; const best = new Map<string, number>();
  const h = (c: Pos) => Math.abs(c[0] - to[0]) + Math.abs(c[1] - to[1]) + Math.abs(c[2] - to[2]);
  const start: N = { c: from, g: 0, f: h(from), k: keyOf(from) };
  open.push(start); best.set(start.k, 0);
  let nodes = 0;
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.k === goal) {
      const path: Pos[] = []; for (let n: N | undefined = cur; n; n = n.prev) path.push(n.c);
      path.reverse();
      // place the new interior cells
      for (let i = 1; i < path.length - 1; i++) {
        const c = path[i]; const p = path[i - 1];
        b.dust(c, net, o.floor);
        if (c[1] > p[1]) b.clear([p[0], p[1] + 1, p[2]]);               // the lower dust needs air above it to climb
        if (c[1] < p[1]) b.clear([c[0], p[1], c[2]]);                   // the upper dust needs air beside it to step down
      }
      const last = path[path.length - 1], pen = path[path.length - 2];
      if (pen) { if (last[1] > pen[1]) b.clear([pen[0], pen[1] + 1, pen[2]]); if (last[1] < pen[1]) b.clear([last[0], pen[1], last[2]]); }
      return path;
    }
    if (++nodes > (o.maxNodes ?? 400000)) break;
    const [x, y, z] = cur.c;
    for (const [dx, dz] of HDIRS) {
      const tryMove = (c: Pos, extra: number, needClear?: Pos, needFloor?: Pos) => {
        const k = keyOf(c); const isGoal = k === goal;
        if (!isGoal) { if (!free(c) || !floorOk(c) || foreignNear(b, c, net, o.allow, ownSet)) return; }
        if (needClear && !free(needClear) && b.tag(needClear)?.kind !== 'clear') return;
        if (needClear && connective(b.tag(needClear), net, ownSet)) return;
        if (needFloor) { const t = b.tag(needFloor); if (t && t.kind !== 'wool') return; }
        const g = cur.g + 1 + extra;
        if ((best.get(k) ?? Infinity) <= g) return;
        best.set(k, g); open.push({ c, g, f: g + h(c), prev: cur, k });
      };
      tryMove([x + dx, y, z + dz], 0);
      tryMove([x + dx, y + 1, z + dz], 1, [x, y + 1, z], [x + dx, y, z + dz]);
      tryMove([x + dx, y - 1, z + dz], 1, [x + dx, y, z + dz]);
    }
  }
  throw new Error(`route ${net}: no path from ${from.join(',')} to ${to.join(',')}`);
}

/**
 * Turn dust cells of a routed path into repeaters: boosters every <= `maxRun` cells, and when `delay` is given the repeater
 * delays sum to exactly `delay`. The path is directed (signal flows from path[0] to path[last]). Returns the total delay.
 */
export function assignRepeaters(b: Board, path: Pos[], net: string, delay?: number, maxRun = 12): number {
  const n = path.length;
  const eligible: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const p = path[i - 1], c = path[i], q = path[i + 1];
    if (p[1] === c[1] && q[1] === c[1] && c[0] - p[0] === q[0] - c[0] && c[2] - p[2] === q[2] - c[2]) eligible.push(i);
  }
  const minR = Math.max(0, Math.floor((n - 2) / (maxRun + 1)));
  let r = minR; if (delay !== undefined) r = Math.max(minR, Math.ceil(delay / 4));
  if (delay !== undefined && r > delay) throw new Error(`route ${net}: delay ${delay} too small for ${r} boosters`);
  if (r > eligible.length) throw new Error(`route ${net}: ${r} repeaters needed but only ${eligible.length} straight cells`);
  const total = delay ?? r;
  if (r === 0) return 0;
  const chosen: number[] = [];
  for (let k = 1; k <= r; k++) {
    const want = Math.round((k * (n - 1)) / (r + 1));
    let bestI = -1, bd = 1e9;
    for (const i of eligible) { if (chosen.includes(i)) continue; const d = Math.abs(i - want); if (d < bd) { bd = d; bestI = i; } }
    chosen.push(bestI);
  }
  chosen.sort((a, c) => a - c);
  const base = Math.floor(total / r), rem = total - base * r;
  chosen.forEach((i, k) => {
    const c = path[i], p = path[i - 1], q = path[i + 1];
    const flow: Dir = q[0] > c[0] ? 'east' : q[0] < c[0] ? 'west' : q[2] > c[2] ? 'south' : 'north';
    void p;
    const d = base + (k < rem ? 1 : 0);
    // replace the dust by a repeater (floor stays)
    b.w.remove(c); b.occ.delete(keyOf(c));
    const floorT = b.tag([c[0], c[1] - 1, c[2]]); void floorT;
    b.w.place(c, 'repeater', { facing: OPP[flow], delay: d });
    b.occ.set(keyOf(c), { kind: 'rep', net });
  });
  return total;
}

// ---------- hopper conveyors ----------
const HDIR: Record<string, [number, number, number]> = { east: [1, 0, 0], west: [-1, 0, 0], south: [0, 0, 1], north: [0, 0, -1], down: [0, -1, 0] };
const dirName = (d: [number, number, number]): Dir => (d[0] > 0 ? 'east' : d[0] < 0 ? 'west' : d[2] > 0 ? 'south' : d[2] < 0 ? 'north' : 'down');

/**
 * Route a hopper conveyor from `from` (a hopper already placed; its facing is set here) to the container `to`
 * (the last conveyor hopper faces INTO `to`). Hoppers move horizontally or one block down (never up).
 * Cells must be free, must not touch foreign dust/repeaters (they would lock the hoppers), and must not sit directly under a container.
 */
export function conveyor(b: Board, from: Pos, to: Pos, net: string, o: { own?: string[]; maxNodes?: number } = {}): Pos[] {
  const ownSet = new Set([net, ...(o.own ?? [])]);
  const goal = keyOf(to);
  const isContainer = (t: Tag | undefined) => !!t && t.kind === 'piston' && t.net === '__s';
  const ok = (c: Pos, prev: Pos): boolean => {
    if (!b.isFree(c)) return false;
    // not directly under a foreign container (the hopper would pull from it)
    const up = b.tag([c[0], c[1] + 1, c[2]]);
    if (up && isContainer(up) && keyOf([c[0], c[1] + 1, c[2]]) !== keyOf(prev)) return false;
    // no foreign signal parts next to it
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
      const t = b.tag([c[0] + dx, c[1] + dy, c[2] + dz]);
      if (t && CONNECTIVE.includes(t.kind) && t.kind !== 'piston' && !(t.net && ownSet.has(t.net))) return false;
    }
    return true;
  };
  type N = { c: Pos; g: number; f: number; prev?: N; k: string };
  const h = (c: Pos) => Math.abs(c[0] - to[0]) + Math.abs(c[1] - to[1]) + Math.abs(c[2] - to[2]);
  const open: N[] = [{ c: from, g: 0, f: h(from), k: keyOf(from) }]; const best = new Map<string, number>([[keyOf(from), 0]]);
  let nodes = 0;
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    // goal test: cur is adjacent (horizontal or directly above) to `to`
    const adj = HDIR; void adj;
    for (const dn of ['east', 'west', 'south', 'north', 'down']) {
      const d = HDIR[dn]; const nx: Pos = [cur.c[0] + d[0], cur.c[1] + d[1], cur.c[2] + d[2]];
      if (keyOf(nx) === goal) {
        const path: Pos[] = []; for (let n: N | undefined = cur; n; n = n.prev) path.push(n.c);
        path.reverse();
        // place hoppers: facing = direction to the next cell; last faces into `to`
        for (let i = 0; i < path.length; i++) {
          const nextC = i + 1 < path.length ? path[i + 1] : to;
          const dd: [number, number, number] = [nextC[0] - path[i][0], nextC[1] - path[i][1], nextC[2] - path[i][2]];
          const f = dirName(dd);
          if (i === 0) { b.w.remove(path[0]); b.occ.delete(keyOf(path[0])); }
          b.raw(path[i], 'hopper', { facing: f }, 'piston', '__s');
        }
        return path;
      }
    }
    if (++nodes > (o.maxNodes ?? 200000)) break;
    for (const dn of ['east', 'west', 'south', 'north', 'down']) {
      const d = HDIR[dn]; const nx: Pos = [cur.c[0] + d[0], cur.c[1] + d[1], cur.c[2] + d[2]];
      const k = keyOf(nx);
      if (!ok(nx, cur.c)) continue;
      const g = cur.g + 1 + (dn === 'down' ? 0.1 : 0);
      if ((best.get(k) ?? Infinity) <= g) continue;
      best.set(k, g); open.push({ c: nx, g, f: g + h(nx), prev: cur, k });
    }
  }
  throw new Error(`conveyor ${net}: no path from ${from.join(',')} to ${to.join(',')}`);
}
