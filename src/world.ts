/**
 * Redstone engine modelled on Minecraft Java Edition 1.20 (non-experimental,
 * instant neighbor updates, legacy wire algorithm).
 *
 * Conventions follow vanilla block states:
 *  - repeater `facing` is the INPUT side (output is the opposite side)
 *  - lever/button `face` = floor|wall|ceiling, `facing` = direction the lever points away from its support
 *  - redstone_wall_torch `facing` = direction the torch points away from the wall
 */
import {
  DIRS, UPDATE_ORDER, HORIZONTAL, clockwise, counterClockwise, isHorizontal,
  javaSetOrder, key, opposite, rel,
  type Dir, type Pos,
} from './dirs.ts';

export interface Block {
  type: string;
  p: Record<string, any>;
}

const AIR: Block = { type: 'air', p: {} };

interface Def { solid: boolean; conductor: boolean; source: boolean }
const DEFS: Record<string, Def> = {
  air: { solid: false, conductor: false, source: false },
  stone: { solid: true, conductor: true, source: false },
  glass: { solid: true, conductor: false, source: false },
  redstone_lamp: { solid: true, conductor: true, source: false },
  redstone_block: { solid: true, conductor: false, source: true },
  redstone_wire: { solid: false, conductor: false, source: true },
  lever: { solid: false, conductor: false, source: true },
  stone_button: { solid: false, conductor: false, source: true },
  redstone_torch: { solid: false, conductor: false, source: true },
  redstone_wall_torch: { solid: false, conductor: false, source: true },
  repeater: { solid: false, conductor: false, source: true },
};
const def = (b: Block): Def => DEFS[b.type] ?? DEFS.air;

type Prio = -3 | -2 | -1 | 0;
interface Tick { k: string; pos: Pos; time: number; prio: Prio; seq: number }
type Conn = 'none' | 'side' | 'up';

export class World {
  blocks = new Map<string, Block>();
  time = 0;
  private seq = 0;
  private pending = new Map<string, Tick>();
  private toRun: Tick[] = [];
  private toRunSet = new Set<string>();
  private toggles: { k: string; when: number }[] = [];
  private wireShouldSignal = true;

  // ---------- basic access ----------
  get(p: Pos): Block { return this.blocks.get(key(p)) ?? AIR; }
  isConductor(p: Pos): boolean { return def(this.get(p)).conductor; }

  /** Raw set, no updates (use `place` for player-like placement). */
  private store(p: Pos, b: Block): void {
    if (b.type === 'air') this.blocks.delete(key(p)); else this.blocks.set(key(p), b);
  }

  /** Vanilla setBlock: flags&1 => notify neighbors. onPlace/onRemove always run. */
  private setBlock(p: Pos, nb: Block, flags: number): void {
    const old = this.get(p);
    this.store(p, nb);
    if (old.type !== nb.type) this.onRemove(p, old, nb);
    this.onPlace(p, nb, old);
    if (flags & 1) this.updateNeighborsAt(p);
  }

  /** Place a block like a player would (applies defaults, placement hooks). */
  place(p: Pos, type: string, props: Record<string, any> = {}): void {
    if (!(type in DEFS)) throw new Error(`unknown block type: ${type}`);
    const b: Block = { type, p: { ...props } };
    switch (type) {
      case 'redstone_wire': b.p.power ??= 0; break;
      case 'lever': case 'stone_button':
        b.p.face ??= 'floor'; b.p.facing ??= 'north'; b.p.powered ??= false; break;
      case 'redstone_torch': b.p.lit ??= true; break;
      case 'redstone_wall_torch': b.p.lit ??= true; b.p.facing ??= 'north'; break;
      case 'repeater':
        b.p.facing ??= 'north'; b.p.delay ??= 1; b.p.powered ??= false; break;
      case 'redstone_lamp': b.p.lit = b.p.lit ?? this.hasNeighborSignal(p); break;
    }
    this.setBlock(p, b, 3);
    if (type === 'repeater' && this.diodeShouldTurnOn(p, b)) this.scheduleTick(p, 1, 0);
  }

  remove(p: Pos): void { this.setBlock(p, AIR, 3); }

  /** Right-click: toggle lever / press button. */
  use(p: Pos): void {
    const b = this.get(p);
    if (b.type === 'lever') {
      this.setBlock(p, { type: b.type, p: { ...b.p, powered: !b.p.powered } }, 3);
      this.attachedUpdate(p, b);
    } else if (b.type === 'stone_button' && !b.p.powered) {
      this.setBlock(p, { type: b.type, p: { ...b.p, powered: true } }, 3);
      this.attachedUpdate(p, b);
      this.scheduleTick(p, 20, 0);
    } else if (b.type === 'repeater') {
      this.setBlock(p, { type: b.type, p: { ...b.p, delay: (b.p.delay % 4) + 1 } }, 3);
    }
  }

  private connectedDir(b: Block): Dir {
    return b.p.face === 'ceiling' ? 'down' : b.p.face === 'floor' ? 'up' : b.p.facing;
  }
  private attachedUpdate(p: Pos, b: Block): void {
    this.updateNeighborsAt(p);
    this.updateNeighborsAt(rel(p, opposite(this.connectedDir(b))));
  }

  // ---------- ticking ----------
  scheduleTick(p: Pos, delay: number, prio: Prio): void {
    const k = key(p);
    if (this.pending.has(k)) return;
    this.pending.set(k, { k, pos: p, time: this.time + delay, prio, seq: this.seq++ });
  }
  private hasTick(p: Pos): boolean { return this.pending.has(key(p)); }
  private willTickThisTick(p: Pos): boolean { return this.toRunSet.has(key(p)); }

  /** Advance one game tick. */
  step(actions?: () => void): void {
    this.time++;
    actions?.();
    const due = [...this.pending.values()].filter((t) => t.time <= this.time);
    due.sort((a, b) => a.time - b.time || a.prio - b.prio || a.seq - b.seq);
    for (const t of due) { this.pending.delete(t.k); this.toRunSet.add(t.k); }
    this.toRun = due;
    while (this.toRun.length) {
      const t = this.toRun.shift()!;
      this.toRunSet.delete(t.k);
      this.tickBlock(t.pos);
    }
  }
  run(n: number): void { for (let i = 0; i < n; i++) this.step(); }

  private tickBlock(p: Pos): void {
    const b = this.get(p);
    switch (b.type) {
      case 'repeater': this.repeaterTick(p, b); break;
      case 'redstone_torch': case 'redstone_wall_torch': this.torchTick(p, b); break;
      case 'redstone_lamp':
        if (b.p.lit && !this.hasNeighborSignal(p))
          this.setBlock(p, { type: b.type, p: { ...b.p, lit: false } }, 2);
        break;
      case 'stone_button':
        if (b.p.powered) {
          this.setBlock(p, { type: b.type, p: { ...b.p, powered: false } }, 3);
          this.attachedUpdate(p, b);
        }
        break;
    }
  }

  // ---------- neighbor updates ----------
  updateNeighborsAt(p: Pos, except?: Dir): void {
    for (const d of UPDATE_ORDER) if (d !== except) this.neighborChanged(rel(p, d), p);
  }

  private neighborChanged(p: Pos, from: Pos): void {
    const b = this.get(p);
    switch (b.type) {
      case 'redstone_wire': this.updatePowerStrength(p); break;
      case 'repeater': this.checkTickOnNeighbor(p, b); break;
      case 'redstone_torch': case 'redstone_wall_torch':
        if (b.p.lit === this.torchHasSignal(p, b) && !this.willTickThisTick(p)) this.scheduleTick(p, 2, 0);
        break;
      case 'redstone_lamp': {
        const sig = this.hasNeighborSignal(p);
        if (b.p.lit !== sig) {
          if (b.p.lit) this.scheduleTick(p, 4, 0);
          else this.setBlock(p, { type: b.type, p: { ...b.p, lit: true } }, 2);
        }
        break;
      }
    }
  }

  private onPlace(p: Pos, b: Block, old: Block): void {
    switch (b.type) {
      case 'redstone_wire':
        if (old.type !== b.type) {
          this.updatePowerStrength(p);
          for (const d of ['up', 'down'] as Dir[]) this.updateNeighborsAt(rel(p, d));
          this.updateNeighborsOfNeighboringWires(p);
        }
        break;
      case 'redstone_torch': case 'redstone_wall_torch':
        for (const d of DIRS) this.updateNeighborsAt(rel(p, d));
        break;
      case 'repeater': this.updateNeighborsInFront(p, b); break;
    }
  }

  private onRemove(p: Pos, old: Block, _nw: Block): void {
    switch (old.type) {
      case 'redstone_wire':
        for (const d of DIRS) this.updateNeighborsAt(rel(p, d));
        break;
      case 'redstone_torch': case 'redstone_wall_torch':
        for (const d of DIRS) this.updateNeighborsAt(rel(p, d));
        break;
      case 'repeater': this.updateNeighborsInFront(p, old); break;
      case 'lever': case 'stone_button':
        if (old.p.powered) this.attachedUpdate(p, old);
        break;
    }
  }

  // ---------- signal queries ----------
  /** Level.getSignal: `dir` points from the querier toward `p`. */
  getSignal(p: Pos, dir: Dir): number {
    const b = this.get(p);
    const i = this.blockSignal(b, p, dir);
    return def(b).conductor ? Math.max(i, this.getDirectSignalTo(p)) : i;
  }
  getDirectSignal(p: Pos, dir: Dir): number {
    const b = this.get(p);
    switch (b.type) {
      case 'redstone_wire': return this.wireShouldSignal ? this.blockSignal(b, p, dir) : 0;
      case 'lever': case 'stone_button':
        return b.p.powered && this.connectedDir(b) === dir ? 15 : 0;
      case 'redstone_torch': case 'redstone_wall_torch':
        return dir === 'down' ? this.blockSignal(b, p, dir) : 0;
      case 'repeater': return this.blockSignal(b, p, dir);
      default: return 0;
    }
  }
  private getDirectSignalTo(p: Pos): number {
    let m = 0;
    for (const d of DIRS) {
      m = Math.max(m, this.getDirectSignal(rel(p, d), d));
      if (m >= 15) return m;
    }
    return m;
  }
  hasSignal(p: Pos, dir: Dir): boolean { return this.getSignal(p, dir) > 0; }
  hasNeighborSignal(p: Pos): boolean {
    return DIRS.some((d) => this.hasSignal(rel(p, d), d));
  }
  private bestNeighborSignal(p: Pos): number {
    let m = 0;
    for (const d of DIRS) {
      const s = this.getSignal(rel(p, d), d);
      if (s >= 15) return 15;
      m = Math.max(m, s);
    }
    return m;
  }

  private blockSignal(b: Block, p: Pos, dir: Dir): number {
    switch (b.type) {
      case 'redstone_block': return 15;
      case 'lever': case 'stone_button': return b.p.powered ? 15 : 0;
      case 'redstone_torch': return b.p.lit && dir !== 'up' ? 15 : 0;
      case 'redstone_wall_torch': return b.p.lit && b.p.facing !== dir ? 15 : 0;
      case 'repeater': return b.p.powered && b.p.facing === dir ? 15 : 0;
      case 'redstone_wire': {
        if (!this.wireShouldSignal || dir === 'down') return 0;
        const power: number = b.p.power;
        if (power === 0) return 0;
        if (dir === 'up') return power;
        return this.wireConnections(p)[opposite(dir) as string] !== 'none' ? power : 0;
      }
      default: return 0;
    }
  }

  // ---------- redstone wire ----------
  private wireConnectsTo(b: Block, dir: Dir | null): boolean {
    if (b.type === 'redstone_wire') return true;
    if (b.type === 'repeater') return dir !== null && (b.p.facing === dir || opposite(b.p.facing) === dir);
    return dir !== null && def(b).source;
  }

  private connectingSide(p: Pos, dir: Dir, nonSolidAbove: boolean): Conn {
    const p1 = rel(p, dir);
    const b = this.get(p1);
    if (nonSolidAbove) {
      if (def(b).solid && this.wireConnectsTo(this.get(rel(p1, 'up')), null)) return 'up';
    }
    if (this.wireConnectsTo(b, dir) ||
        (!def(b).conductor && this.wireConnectsTo(this.get(rel(p1, 'down')), null))) return 'side';
    return 'none';
  }

  /** Connection state per horizontal direction, including line/dot extension rules. */
  wireConnections(p: Pos): Record<string, Conn> {
    const above = !this.isConductor(rel(p, 'up'));
    const c: Record<string, Conn> = {};
    for (const d of HORIZONTAL) c[d] = this.connectingSide(p, d, above);
    const n = c.north !== 'none', s = c.south !== 'none', e = c.east !== 'none', w = c.west !== 'none';
    if (!n && !s && !e && !w) return c; // dot
    const ns = !n && !s, ew = !e && !w;
    if (!w && ns) c.west = 'side';
    if (!e && ns) c.east = 'side';
    if (!n && ew) c.north = 'side';
    if (!s && ew) c.south = 'side';
    return c;
  }

  private wirePower(b: Block): number { return b.type === 'redstone_wire' ? b.p.power : 0; }

  private calcWireTarget(p: Pos): number {
    this.wireShouldSignal = false;
    const i = this.bestNeighborSignal(p);
    this.wireShouldSignal = true;
    let j = 0;
    if (i < 15) {
      const up = rel(p, 'up');
      for (const d of HORIZONTAL) {
        const p1 = rel(p, d);
        const b1 = this.get(p1);
        j = Math.max(j, this.wirePower(b1));
        if (def(b1).conductor && !this.isConductor(up)) j = Math.max(j, this.wirePower(this.get(rel(p1, 'up'))));
        else if (!def(b1).conductor) j = Math.max(j, this.wirePower(this.get(rel(p1, 'down'))));
      }
    }
    return Math.max(i, j - 1);
  }

  private updatePowerStrength(p: Pos): void {
    const b = this.get(p);
    const target = this.calcWireTarget(p);
    if (b.p.power === target) return;
    this.setBlock(p, { type: b.type, p: { ...b.p, power: target } }, 2);
    const set = javaSetOrder([p, ...DIRS.map((d) => rel(p, d))]);
    for (const q of set) this.updateNeighborsAt(q);
  }

  private checkCornerChangeAt(p: Pos): void {
    if (this.get(p).type !== 'redstone_wire') return;
    this.updateNeighborsAt(p);
    for (const d of DIRS) this.updateNeighborsAt(rel(p, d));
  }
  private updateNeighborsOfNeighboringWires(p: Pos): void {
    for (const d of HORIZONTAL) this.checkCornerChangeAt(rel(p, d));
    for (const d of HORIZONTAL) {
      const p1 = rel(p, d);
      if (this.isConductor(p1)) this.checkCornerChangeAt(rel(p1, 'up'));
      else this.checkCornerChangeAt(rel(p1, 'down'));
    }
  }

  // ---------- repeater ----------
  private isDiode(b: Block): boolean { return b.type === 'repeater'; }

  private diodeInput(p: Pos, b: Block): number {
    const d: Dir = b.p.facing;
    const q = rel(p, d);
    const i = this.getSignal(q, d);
    if (i >= 15) return i;
    return Math.max(i, this.wirePower(this.get(q)));
  }
  private diodeShouldTurnOn(p: Pos, b: Block): boolean { return this.diodeInput(p, b) > 0; }

  private diodeLocked(p: Pos, b: Block): boolean {
    for (const d of [clockwise(b.p.facing), counterClockwise(b.p.facing)]) {
      const q = rel(p, d);
      if (this.isDiode(this.get(q)) && this.getDirectSignal(q, d) > 0) return true;
    }
    return false;
  }

  private checkTickOnNeighbor(p: Pos, b: Block): void {
    if (this.diodeLocked(p, b)) return;
    const powered: boolean = b.p.powered;
    const should = this.diodeShouldTurnOn(p, b);
    if (powered !== should && !this.willTickThisTick(p)) {
      let prio: Prio = 0;
      const front = this.get(rel(p, opposite(b.p.facing)));
      if (this.isDiode(front) && front.p.facing !== b.p.facing) prio = -3;
      else if (powered) prio = -2;
      this.scheduleTick(p, b.p.delay * 2, prio);
    }
  }

  private repeaterTick(p: Pos, b: Block): void {
    if (this.diodeLocked(p, b)) return;
    const powered: boolean = b.p.powered;
    const should = this.diodeShouldTurnOn(p, b);
    if (powered && !should) {
      this.setBlock(p, { type: b.type, p: { ...b.p, powered: false } }, 2);
    } else if (!powered) {
      this.setBlock(p, { type: b.type, p: { ...b.p, powered: true } }, 2);
      if (!should) this.scheduleTick(p, b.p.delay * 2, -2);
    }
  }

  private updateNeighborsInFront(p: Pos, b: Block): void {
    const out = rel(p, opposite(b.p.facing));
    this.neighborChanged(out, p);
    this.updateNeighborsAt(out, b.p.facing);
  }

  // ---------- torch ----------
  private torchHasSignal(p: Pos, b: Block): boolean {
    if (b.type === 'redstone_wall_torch') {
      const back = opposite(b.p.facing as Dir);
      return this.hasSignal(rel(p, back), back);
    }
    return this.hasSignal(rel(p, 'down'), 'down');
  }

  private tooFrequent(p: Pos, add: boolean): boolean {
    const k = key(p);
    if (add) this.toggles.push({ k, when: this.time });
    return this.toggles.filter((t) => t.k === k).length >= 8;
  }

  private torchTick(p: Pos, b: Block): void {
    const sig = this.torchHasSignal(p, b);
    while (this.toggles.length && this.time - this.toggles[0].when > 60) this.toggles.shift();
    if (b.p.lit) {
      if (sig) {
        this.setBlock(p, { type: b.type, p: { ...b.p, lit: false } }, 3);
        if (this.tooFrequent(p, true)) this.scheduleTick(p, 160, 0);
      }
    } else if (!sig && !this.tooFrequent(p, false)) {
      this.setBlock(p, { type: b.type, p: { ...b.p, lit: true } }, 3);
    }
  }

  // ---------- inspection ----------
  /** Value of a state property (`power`, `lit`, `powered`, ...) at a position. */
  read(p: Pos, prop: string): any {
    const b = this.get(p);
    if (prop === 'type') return b.type;
    return b.p[prop];
  }
}
