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

export type Kind = 'wool' | 'dust' | 'rep' | 'cmp' | 'obs' | 'piston' | 'other' | 'clear' | 'lever' | 'reserve';
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
    if (t && !(t.kind === 'clear') && t.kind !== 'reserve') throw new Error(`${type} at ${p.join(',')}: cell occupied by ${t.kind}${t.net ? ' (' + t.net + ')' : ''}`);
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
  /** keep a corridor of free cells (and one cell either side) open in front of a pin so that later conveyors do not wall the pin in */
  reserveCorridor(pin: Pos, dir: [number, number], len: number, net: string): void {
    for (let k = 1; k <= len; k++) for (let l = -1; l <= 1; l++) {
      const c: Pos = [pin[0] + dir[0] * k + (dir[1] !== 0 ? l : 0), pin[1], pin[2] + dir[1] * k + (dir[0] !== 0 ? l : 0)];
      for (const dy of [0, 1]) { const q: Pos = [c[0], c[1] + dy, c[2]]; if (this.isFree(q)) this.occ.set(keyOf(q), { kind: 'reserve', net }); }
      const f: Pos = [c[0], c[1] - 1, c[2]];
      if (this.isFree(f)) { this.occ.set(keyOf(f), { kind: 'wool' }); this.w.place(f, 'light_gray_wool'); }
    }
  }
  /** reserve a cell that has to stay empty (air) */
  clear(p: Pos): void { if (this.isFree(p)) this.occ.set(keyOf(p), { kind: 'clear' }); }
}


/** minimal binary min-heap on `f` (A* open list; the linear scan was O(n^2) on long routes) */
class Heap<T extends { f: number }> {
  private a: T[] = [];
  get length(): number { return this.a.length; }
  push(x: T): void { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop(): T {
    const a = this.a; const top = a[0]; const last = a.pop()!;
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}

const connective = (t: Tag | undefined, net: string, own?: Set<string>): boolean => !!t && CONNECTIVE.includes(t.kind) && t.net !== net && !(own && t.net && own.has(t.net));

export interface RouteOpts { floor?: string; allow?: Set<string>; maxNodes?: number; own?: string[]; strict?: boolean }

/** keep-out test: is there a foreign connective part within the 3x3x3 neighbourhood of c? */
function foreignNear(b: Board, c: Pos, net: string, allow?: Set<string>, own?: Set<string>, nearEnd?: (k: string) => boolean): boolean {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    if (!dx && !dy && !dz) continue;
    const k = key(c[0] + dx, c[1] + dy, c[2] + dz);
    if (allow?.has(k)) continue;
    const tg = b.occ.get(k);
    if (connective(tg, net, own)) { if (process.env.DEBUG_ROUTE === '2' && c[0] === 4 && c[1] === 0 && c[2] === 22) console.log('C hit', c[0]+dx, c[1]+dy, c[2]+dz, tg); return true; }
    if (nearEnd && tg && CONNECTIVE.includes(tg.kind) && tg.net && (tg.net === net || (own && own.has(tg.net))) && !nearEnd(k)) return true;
  }
  // dust powers the block it sits on, and a powered block locks the hoppers (and triggers the droppers) next to it
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
    const pk = key(c[0] + dx, c[1] - 1 + dy, c[2] + dz);
    if (allow?.has(pk)) continue;
    const t = b.occ.get(pk);
    if (t && t.net === '__s' && net !== '__s') return true;
  }
  // quasi-connectivity: droppers / crafters / pistons ('__q') also react to power at the cell ABOVE them (A) or next to it: keep every
  // signal part further than 3 steps (Manhattan) from A. A powered neighbour block of A is fed by wiring up to 2 steps away.
  for (let ex = -3; ex <= 3; ex++) for (let ey = -3; ey <= 3; ey++) for (let ez = -3; ez <= 3; ez++) {
    if (Math.abs(ex) + Math.abs(ey) + Math.abs(ez) > 3) continue;
    const pk = key(c[0] + ex, c[1] + ey - 1, c[2] + ez);
    if (allow?.has(pk)) continue;
    const t = b.occ.get(pk);
    if (t && t.net === '__q' && net !== '__q') return true;
  }
  return false;
}

/** Route dust from the dust cell `from` to the dust cell `to` (both already placed, net `net`). Returns the full cell list. */
export function route(b: Board, from: Pos, to: Pos, net: string, o: RouteOpts = {}): Pos[] {
  const avoid = new Set<string>();
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = routeOnce(b, from, to, net, o, avoid);
    if (Array.isArray(r)) return r;
    avoid.add(r.bad);
    if (process.env.DEBUG_ROUTE) console.log('route retry', net, 'bad cell', r.bad);
  }
  throw new Error(`route ${net}: no consistent path from ${from.join(',')} to ${to.join(',')}`);
}

function routeOnce(b: Board, from: Pos, to: Pos, net: string, o: RouteOpts, avoid: Set<string>): Pos[] | { bad: string } {
  const goal = keyOf(to);
  const ownSet = new Set(o.own ?? []);
  // strict: pre-existing parts of the route's own nets only count as friendly right next to the two end points (a route that runs alongside its own
  // lane would close a repeater ring, which latches)
  const nearEnd = (k: string) => { const [x, y, z] = k.split(',').map(Number); return [from, to].some((e) => Math.abs(e[0] - x) <= 1 && Math.abs(e[1] - y) <= 1 && Math.abs(e[2] - z) <= 1); };
  const floorOk = (c: Pos) => { const t = b.tag([c[0], c[1] - 1, c[2]]); return !t || t.kind === 'wool'; };
  const free = (c: Pos) => { if (avoid.has(keyOf(c))) return false; const t = b.tag(c); return !t || (t.kind === 'reserve' && (t.net === net || ownSet.has(t.net ?? '') || net.startsWith(t.net ?? '\0'))); };
  type N = { c: Pos; g: number; f: number; prev?: N; k: string; d: number; ck: string };
  const open = new Heap<N>(); const best = new Map<string, number>();
  const h = (c: Pos) => Math.abs(c[0] - to[0]) + Math.abs(c[1] - to[1]) + Math.abs(c[2] - to[2]);
  const start: N = { c: from, g: 0, f: h(from), k: keyOf(from) + '|-1', d: -1, ck: keyOf(from) };
  open.push(start); best.set(start.k, 0);
  let nodes = 0; const bb = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
  while (open.length) {
    const cur = open.pop();
    if (cur.ck === goal) {
      const path: Pos[] = []; for (let n: N | undefined = cur; n; n = n.prev) path.push(n.c);
      path.reverse();
      // self-consistency: no cell's wool floor may be a cell the same path needs to keep clear or occupy
      const clears = new Set<string>(); const dusts = new Set<string>(); const floors = new Set<string>();
      const seen = new Set<string>(); for (const c of path) { const kk = keyOf(c); if (seen.has(kk)) return { bad: kk }; seen.add(kk); }
      for (let i = 1; i < path.length - 1; i++) { const c = path[i]; const p = path[i - 1]; dusts.add(keyOf(c)); floors.add(key(c[0], c[1] - 1, c[2])); if (c[1] > p[1]) clears.add(key(p[0], p[1] + 1, p[2])); if (c[1] < p[1]) clears.add(key(c[0], p[1], c[2])); }
      for (const f of floors) if (clears.has(f) || dusts.has(f)) { if (process.env.DEBUG_ROUTE) console.log('  bad floor', f, 'path', path.slice(0, 12).map((q) => q.join(',')).join(' ')); return { bad: f }; }
      for (const d of dusts) if (clears.has(d)) { if (process.env.DEBUG_ROUTE) console.log('  bad dust', d, 'path', path.slice(0, 12).map((q) => q.join(',')).join(' ')); return { bad: d }; }
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
    if (process.env.DEBUG_ROUTE === '2') { bb[0] = Math.min(bb[0], cur.c[0]); bb[1] = Math.max(bb[1], cur.c[0]); bb[2] = Math.min(bb[2], cur.c[1]); bb[3] = Math.max(bb[3], cur.c[1]); bb[4] = Math.min(bb[4], cur.c[2]); bb[5] = Math.max(bb[5], cur.c[2]); }
    const [x, y, z] = cur.c;
    for (let di = 0; di < HDIRS.length; di++) {
      const [dx, dz] = HDIRS[di];
      // local self-consistency: the last cells of this very path must not need a cell both as wool/dust and as air
      const conflictsWithRecent = (from: N, c: Pos, needClear?: Pos): boolean => {
        const F = keyOf([c[0], c[1] - 1, c[2]]), C = keyOf(c), Z = needClear ? keyOf(needClear) : '';
        let prev: N | undefined = from;
        for (let n: N | undefined = from, i = 0; n && i < 24; n = n.prev, i++) {
          const nk = keyOf(n.c);
          if (nk === C) return true;                                                       // no cell twice
          if (nk === F || (Z && nk === Z)) return true;                                    // our floor / clearance would be an existing dust cell
          if (keyOf([n.c[0], n.c[1] - 1, n.c[2]]) === C || (Z && keyOf([n.c[0], n.c[1] - 1, n.c[2]]) === Z)) return true;   // their floor is our dust/clearance
          if (n.prev) {
            const p0 = n.prev.c, q0 = n.c; let clr: string | undefined;
            if (q0[1] > p0[1]) clr = keyOf([p0[0], p0[1] + 1, p0[2]]); else if (q0[1] < p0[1]) clr = keyOf([q0[0], p0[1], q0[2]]);
            if (clr && (clr === C || clr === F)) return true;                            // their clearance is our dust / floor
          }
          prev = n;
        }
        void prev;
        return false;
      };
      const tryMove = (c: Pos, extra: number, needClear?: Pos, needFloor?: Pos, vertical = false) => {
        if (vertical && cur.d !== -1 && cur.d !== di) return;               // straight staircases only: a spiral would need a floor where the lower dust needs air
        const ck = keyOf(c); const k = ck + '|' + di; const isGoal = ck === goal;
        if (!isGoal) { if (!free(c) || !floorOk(c) || foreignNear(b, c, net, o.allow, ownSet, o.strict ? nearEnd : undefined)) return; }
        if (needClear && !free(needClear) && b.tag(needClear)?.kind !== 'clear') return;
        if (!isGoal && conflictsWithRecent(cur, c, needClear)) return;
        if (needClear && connective(b.tag(needClear), net, ownSet)) return;
        if (needFloor) { const t = b.tag(needFloor); if (t && t.kind !== 'wool') return; }
        const g = cur.g + 1 + extra;
        if ((best.get(k) ?? Infinity) <= g) return;
        best.set(k, g); open.push({ c, g, f: g + h(c), prev: cur, k, d: di, ck });
      };
      tryMove([x + dx, y, z + dz], 0);
      tryMove([x + dx, y + 1, z + dz], 1, [x, y + 1, z], [x + dx, y, z + dz], true);
      tryMove([x + dx, y - 1, z + dz], 1, [x + dx, y, z + dz], undefined, true);
    }
  }
  if (process.env.DEBUG_ROUTE) {
    const why = (c: Pos) => `${c.join(',')}: ${!b.isFree(c) ? 'occupied ' + JSON.stringify(b.tag(c)) : !floorOk(c) ? 'floor ' + JSON.stringify(b.tag([c[0], c[1] - 1, c[2]])) : foreignNear(b, c, net, o.allow, ownSet, o.strict ? nearEnd : undefined) ? 'foreign-near' : 'ok'}`;
    if (process.env.DEBUG_ROUTE === '2') { const c: Pos = [to[0], to[1], to[2] + 3]; for (let dx = -2; dx <= 2; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -2; dz <= 2; dz++) { const t = b.tag([c[0] + dx, c[1] + dy, c[2] + dz]); if (t && t.kind !== 'reserve' && t.kind !== 'wool') console.log(' nb', c[0] + dx, c[1] + dy, c[2] + dz, JSON.stringify(t)); } }
    if (process.env.DEBUG_ROUTE === '2') for (let zz = 4; zz <= 14; zz++) { const c: Pos = [to[0] - (zz - 3), to[1], to[2]]; console.log(' col', c.join(','), 'fn', foreignNear(b, c, net, o.allow, ownSet, o.strict ? nearEnd : undefined), 'floor', floorOk(c), 'free', free(c), HDIRS.some((_, di) => best.has(keyOf(c) + '|' + di)) ? 'VISITED' : ''); }
    if (process.env.DEBUG_ROUTE === '2') console.log(' bbox x', bb[0], bb[1], 'y', bb[2], bb[3], 'z', bb[4], bb[5]);
    for (const dx of [1,2,3,4,5,6,7,8,10,14]) for (const sx of [-1,1]) { const c: Pos = [to[0] + sx*dx, to[1], to[2]]; if (process.env.DEBUG_ROUTE === '2') console.log(' ray', why(c), 'fn', foreignNear(b, c, net, o.allow, ownSet, o.strict ? nearEnd : undefined), 'floor', floorOk(c), 'free', free(c), HDIRS.some((_, di) => best.has(keyOf(c) + '|' + di)) ? 'VISITED' : ''); }
    console.log('route fail; expanded', nodes, '\nstart nbrs:\n ' + HDIRS.map(([dx, dz]) => why([from[0] + dx, from[1], from[2] + dz])).join('\n '), '\ngoal nbrs:\n ' + HDIRS.map(([dx, dz]) => why([to[0] + dx, to[1], to[2] + dz])).join('\n '));
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
    // a hopper directly below would suck the items out of this one (only the final target may sit below)
    { const dn: Pos = [c[0], c[1] - 1, c[2]]; if (isContainer(b.tag(dn)) && keyOf(dn) !== goal) return false; }
    // dust powers its floor block, and a powered block next to a hopper locks it
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
      const n: Pos = [c[0] + dx, c[1] + dy, c[2] + dz];
      if (b.tag(n)?.kind === 'wool' && b.tag([n[0], n[1] + 1, n[2]])?.kind === 'dust' && !(dy === 1 && false)) return false;
    }
    // keep clear of the corridors reserved for pulse lanes
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const t = b.tag([c[0] + dx, c[1] + dy, c[2] + dz]); if (t?.kind === 'reserve' && !(t.net && ownSet.has(t.net))) return false; }
    // no foreign signal parts next to it
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
      const t = b.tag([c[0] + dx, c[1] + dy, c[2] + dz]);
      if (dy === -1 && t && ['dust', 'rep', 'cmp'].includes(t.kind)) continue;      // wiring directly under a hopper cannot power it
      if (t && CONNECTIVE.includes(t.kind) && t.kind !== 'piston' && !(t.net && ownSet.has(t.net))) return false;
    }
    return true;
  };
  type N = { c: Pos; g: number; f: number; prev?: N; k: string };
  const h = (c: Pos) => Math.abs(c[0] - to[0]) + Math.abs(c[1] - to[1]) + Math.abs(c[2] - to[2]);
  const open = new Heap<N>(); open.push({ c: from, g: 0, f: h(from), k: keyOf(from) }); const best = new Map<string, number>([[keyOf(from), 0]]);
  let nodes = 0; const bb = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
  while (open.length) {
    const cur = open.pop();
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
    for (let q = 0; q < 3; q++) { bb[2 * q] = Math.min(bb[2 * q], cur.c[q]); bb[2 * q + 1] = Math.max(bb[2 * q + 1], cur.c[q]); }
    for (const dn of ['east', 'west', 'south', 'north', 'down']) {
      const d = HDIR[dn]; const nx: Pos = [cur.c[0] + d[0], cur.c[1] + d[1], cur.c[2] + d[2]];
      const k = keyOf(nx);
      if (!ok(nx, cur.c)) continue;
      const g = cur.g + 1 + (dn === 'down' ? 0.1 : 0);
      if ((best.get(k) ?? Infinity) <= g) continue;
      best.set(k, g); open.push({ c: nx, g, f: g + h(nx), prev: cur, k });
    }
  }
  if (process.env.DEBUG_ROUTE) for (let x = bb[0] - 1; x <= bb[1] + 1; x++) for (let z = bb[4] - 1; z <= bb[5] + 1; z++) { const c: Pos = [x, 4, z]; if (!best.has(keyOf(c))) console.log(' blocked', c.join(','), JSON.stringify(b.tag(c)), 'reserveNear', [-1,0,1].some(dx=>[-1,0,1].some(dy=>[-1,0,1].some(dz=>b.tag([x+dx,4+dy,z+dz])?.kind==='reserve'))), 'above', JSON.stringify(b.tag([x,5,z]))); }
  throw new Error(`conveyor ${net}: no path from ${from.join(',')} to ${to.join(',')} (explored ${nodes} nodes, x ${bb[0]}..${bb[1]} y ${bb[2]}..${bb[3]} z ${bb[4]}..${bb[5]})`);
}
