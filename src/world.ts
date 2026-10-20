/**
 * Redstone engine modelled on Minecraft Java Edition 1.20 (non-experimental,
 * instant neighbor updates, legacy wire algorithm).
 *
 * Conventions follow vanilla block states:
 *  - repeater `facing` is the INPUT side (output is the opposite side)
 *  - lever/button `face` = floor|wall|ceiling, `facing` = direction the lever points away from its support
 *  - redstone_wall_torch `facing` = direction the torch points away from the wall
 */
import { JavaRandom } from './jrandom.ts';
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
  obsidian: { solid: true, conductor: true, source: false },
  honey_block: { solid: true, conductor: false, source: false },
  tnt: { solid: true, conductor: true, source: false },
  iron_door: { solid: false, conductor: false, source: false },
  stone_pressure_plate: { solid: false, conductor: false, source: true },
  slime_block: { solid: true, conductor: true, source: false },
  chest: { solid: false, conductor: false, source: false },
  observer: { solid: true, conductor: false, source: true },
  comparator: { solid: false, conductor: false, source: true },
  hopper: { solid: false, conductor: false, source: false },
  dropper: { solid: true, conductor: true, source: false },
  dispenser: { solid: true, conductor: true, source: false },
  barrel: { solid: true, conductor: true, source: false },
  piston: { solid: true, conductor: false, source: false },
  sticky_piston: { solid: true, conductor: false, source: false },
  piston_head: { solid: false, conductor: false, source: false },
  moving_piston: { solid: false, conductor: false, source: false },
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
interface Moving {
  seq: number; moved: Block; dir: Dir; extending: boolean; isSource: boolean;
  progress: number; progressO: number; lastTicked: number;
}
const MIN_Y = -64, MAX_Y = 320;
const SHAPE_ORDER: Dir[] = ['west', 'east', 'north', 'south', 'down', 'up'];
const isPistonType = (b: Block): boolean => b.type === 'piston' || b.type === 'sticky_piston';
const DESTROY = new Set(['iron_door', 'stone_pressure_plate', 'redstone_wire', 'lever', 'stone_button', 'redstone_torch', 'redstone_wall_torch', 'repeater', 'comparator']);
const BLOCKING = new Set(['moving_piston', 'piston_head', 'obsidian']);
const CONTAINER_SIZE: Record<string, number> = { chest: 27, barrel: 27, hopper: 5, dropper: 9, dispenser: 9 };
const BLOCK_ENTITY = new Set(['comparator', ...Object.keys(CONTAINER_SIZE)]);

export interface Item { id: string; count: number }
interface BE { type: string; inv: (Item | null)[]; cooldown: number; ticked: number; seq: number }
const STACK16 = new Set(['ender_pearl', 'snowball', 'egg', 'bucket', 'oak_sign', 'honey_bottle']);
const STACK1 = /(_sword|_pickaxe|_axe|_shovel|_hoe|_helmet|_chestplate|_leggings|_boots|_boat|_bed|_bucket)$|^(bow|shield|minecart|saddle|potion|cake|elytra|shears|fishing_rod|flint_and_steel)$/;
export const maxStack = (id: string): number =>
  STACK16.has(id) ? 16 : STACK1.test(id) && id !== 'bucket' ? 1 : 64;
const norm = (id: string): string => id.replace(/^minecraft:/, '');

export class World {
  blocks = new Map<string, Block>();
  time = 0;
  private seq = 0;
  private pending = new Map<string, Tick>();
  private toRun: Tick[] = [];
  private toRunSet = new Set<string>();
  private toggles: { k: string; when: number }[] = [];
  private wireShouldSignal = true;
  private handlingTick = false;
  private events: { pos: Pos; id: number; dir: Dir }[] = [];
  private ents = new Map<string, Moving>();
  private bes = new Map<string, BE>();
  private held = new Set<string>();
  /** Event log for things that are only recorded, not simulated (TNT). */
  log: { tick: number; event: string; pos: Pos }[] = [];
  private beSeq = 0;
  /** Items dropped into the world by droppers/dispensers (no item entities are simulated). */
  drops: { tick: number; pos: Pos; item: Item }[] = [];
  rng = new JavaRandom(0);

  // ---------- basic access ----------
  get(p: Pos): Block { return this.blocks.get(key(p)) ?? AIR; }
  isConductor(p: Pos): boolean { return def(this.get(p)).conductor; }

  /** Raw set, no updates (use `place` for player-like placement). */
  private store(p: Pos, b: Block): void {
    if (b.type === 'air') this.blocks.delete(key(p)); else this.blocks.set(key(p), b);
  }

  private sameState(a: Block, b: Block): boolean {
    if (a.type !== b.type) return false;
    const ka = Object.keys(a.p).filter((k) => k !== 'output');
    const kb = Object.keys(b.p).filter((k) => k !== 'output');
    return ka.length === kb.length && ka.every((k) => a.p[k] === b.p[k]);
  }

  /**
   * Vanilla setBlock. flags: 1 notify neighbors, 16 suppress shape updates, 64 "isMoving".
   * Returns early when the state is unchanged, like LevelChunk.setBlockState.
   */
  private setBlock(p: Pos, nb: Block, flags: number): void {
    const old = this.get(p);
    if (this.sameState(old, nb)) return;
    if (nb.type === 'comparator' && old.type === 'comparator') nb.p.output = old.p.output;
    this.store(p, nb);
    if (old.type !== nb.type) {
      this.bes.delete(key(p));
      const size = CONTAINER_SIZE[nb.type];
      if (size) this.bes.set(key(p), this.newBE(nb.type, size, nb.p.inv));
      delete nb.p.inv;
      this.onRemove(p, old, nb, (flags & 64) !== 0);
    }
    this.onPlace(p, nb, old);
    if (flags & 1) {
      this.updateNeighborsAt(p);
      if (this.hasAnalog(nb)) this.updateComparatorsAround(p);
    }
    if (!(flags & 16)) this.updateNeighbourShapes(p, flags & ~34);
  }

  /** neighbor.updateShape(dirTowardP, ...) for each neighbor, in vanilla shape order. */
  private updateNeighbourShapes(p: Pos, sf = 0): void {
    for (const d of SHAPE_ORDER) this.shapeUpdate(rel(p, d), opposite(d), sf);
  }

  private shapeUpdate(q: Pos, dirToChanged: Dir, sf: number): void {
    const b = this.get(q);
    switch (b.type) {
      case 'redstone_wire':
        if (isHorizontal(dirToChanged)) this.wireShapeUpdate(q, b, dirToChanged, sf);
        break;
      case 'observer':
        if (b.p.facing === dirToChanged && !b.p.powered && !this.hasTick(q)) this.scheduleTick(q, 2, 0);
        break;
      case 'redstone_torch': case 'redstone_wall_torch': case 'lever': case 'stone_button':
      case 'repeater': case 'comparator': case 'stone_pressure_plate':
        if (!this.canSurvive(q, b)) this.setBlock(q, AIR, 3);
        break;
      case 'iron_door': {
        const lower = b.p.half === 'lower';
        if ((dirToChanged === 'up') === lower && (dirToChanged === 'up' || dirToChanged === 'down')) {
          const o = this.get(rel(q, dirToChanged));
          if (o.type !== 'iron_door' || o.p.half === b.p.half) this.setBlock(q, AIR, 3);
          else this.setBlock(q, { type: b.type, p: { ...b.p, open: o.p.open, powered: o.p.powered, facing: o.p.facing } }, sf);
        } else if (lower && dirToChanged === 'down' && !this.canSurvive(q, b)) this.setBlock(q, AIR, 3);
        break;
      }
    }
  }

  // ---------- survival ----------
  private sturdy(p: Pos, face: Dir): boolean {
    const b = this.get(p);
    if (isPistonType(b)) return !b.p.extended || b.p.facing !== face;
    return def(b).solid;
  }
  private canSurvive(p: Pos, b: Block): boolean {
    switch (b.type) {
      case 'redstone_wire': case 'repeater': case 'comparator': case 'redstone_torch': case 'stone_pressure_plate':
        return this.sturdy(rel(p, 'down'), 'up');
      case 'iron_door': {
        const below = this.get(rel(p, 'down'));
        return b.p.half === 'lower' ? this.sturdy(rel(p, 'down'), 'up') : below.type === 'iron_door';
      }
      case 'redstone_wall_torch':
        return this.sturdy(rel(p, opposite(b.p.facing)), b.p.facing);
      case 'lever': case 'stone_button': {
        const c = this.connectedDir(b);
        return this.sturdy(rel(p, opposite(c)), c);
      }
      default: return true;
    }
  }

  /** Place a block like a player would (applies defaults, placement hooks). */
  place(p: Pos, type: string, props: Record<string, any> = {}): void {
    if (!(type in DEFS)) throw new Error(`unknown block type: ${type}`);
    const b: Block = { type, p: { ...props } };
    switch (type) {
      case 'redstone_wire': {
        b.p.power ??= 0;
        let sides = this.wireRegulate({ north: 'none', east: 'none', south: 'none', west: 'none' }, p);
        if (this.sidesDot(sides)) sides = this.sidesCross();
        Object.assign(b.p, sides);
        break;
      }
      case 'lever': case 'stone_button':
        b.p.face ??= 'floor'; b.p.facing ??= 'north'; b.p.powered ??= false; break;
      case 'redstone_torch': b.p.lit ??= true; break;
      case 'redstone_wall_torch': b.p.lit ??= true; b.p.facing ??= 'north'; break;
      case 'repeater':
        b.p.facing ??= 'north'; b.p.delay ??= 1; b.p.powered ??= false; break;
      case 'redstone_lamp': b.p.lit = b.p.lit ?? this.hasNeighborSignal(p); break;
      case 'comparator':
        b.p.facing ??= 'north'; b.p.mode ??= 'compare'; b.p.powered ??= false; b.p.output = 0; break;
      case 'observer': b.p.facing ??= 'north'; b.p.powered ??= false; break;
      case 'piston': case 'sticky_piston': b.p.facing ??= 'north'; b.p.extended = false; break;
      case 'hopper': b.p.facing ??= 'down'; b.p.enabled = true; break;
      case 'dropper': case 'dispenser': b.p.facing ??= 'north'; b.p.triggered = false; break;
      case 'iron_door': {
        b.p.half = 'lower'; b.p.facing ??= 'north';
        const on = this.hasNeighborSignal(p) || this.hasNeighborSignal(rel(p, 'up'));
        b.p.open = on; b.p.powered = on;
        break;
      }
      case 'stone_pressure_plate': b.p.powered = false; break;
      case 'piston_head': case 'moving_piston': throw new Error(`${type} cannot be placed directly`);
    }
    if (!this.canSurvive(p, b)) throw new Error(`cannot place ${type} at ${p.join(',')}: no valid support`);
    if (type === 'iron_door' && this.get(rel(p, 'up')).type !== 'air') throw new Error(`cannot place iron_door at ${p.join(',')}: needs 2 free blocks`);
    this.setBlock(p, b, 3);
    if (type === 'iron_door') this.setBlock(rel(p, 'up'), { type, p: { ...b.p, half: 'upper' } }, 3);
    if (type === 'repeater' && this.diodeShouldTurnOn(p, this.get(p))) this.scheduleTick(p, 1, 0);
    if (type === 'comparator' && this.cmpShouldTurnOn(p, this.get(p))) this.scheduleTick(p, 1, 0);
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
    } else if (b.type === 'redstone_wire') {
      this.wireToggle(p, b);
    } else if (b.type === 'stone_pressure_plate') {
      const k = key(p);
      if (this.held.has(k)) this.held.delete(k);
      else { this.held.add(k); this.plateCheck(p); }
    } else if (b.type === 'comparator') {
      this.setBlock(p, { type: b.type, p: { ...b.p, mode: b.p.mode === 'compare' ? 'subtract' : 'compare' } }, 2);
      this.cmpRefresh(p, this.get(p));
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

  /**
   * Advance one game tick: scheduled block ticks, block events, moving-piston entities.
   * `actions` run afterwards (player input is handled after the level tick in vanilla).
   */
  step(actions?: () => void): void {
    this.time++;
    this.handlingTick = true;
    const due = [...this.pending.values()].filter((t) => t.time <= this.time);
    due.sort((a, b) => a.time - b.time || a.prio - b.prio || a.seq - b.seq);
    for (const t of due) { this.pending.delete(t.k); this.toRunSet.add(t.k); }
    this.toRun = due;
    while (this.toRun.length) {
      const t = this.toRun.shift()!;
      this.toRunSet.delete(t.k);
      this.tickBlock(t.pos);
    }
    while (this.events.length) this.pistonEvent(this.events.shift()!);
    this.tickBlockEntities();
    this.handlingTick = false;
    actions?.();
  }
  run(n: number): void { for (let i = 0; i < n; i++) this.step(); }

  private tickBlock(p: Pos): void {
    const b = this.get(p);
    switch (b.type) {
      case 'repeater': this.repeaterTick(p, b); break;
      case 'comparator': this.cmpTick(p, b); break;
      case 'dropper': case 'dispenser': this.dispenseFrom(p, b); break;
      case 'stone_pressure_plate': if (b.p.powered) this.plateCheck(p); break;
      case 'observer':
        if (b.p.powered) {
          this.setBlock(p, { type: b.type, p: { ...b.p, powered: false } }, 2);
        } else {
          this.setBlock(p, { type: b.type, p: { ...b.p, powered: true } }, 2);
          this.scheduleTick(p, 2, 0);
        }
        this.updateNeighborsInFront(p, b);
        break;
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
      case 'redstone_wire':
        if (this.canSurvive(p, b)) this.updatePowerStrength(p); else this.setBlock(p, AIR, 3);
        break;
      case 'repeater': case 'comparator':
        if (!this.canSurvive(p, b)) {
          this.setBlock(p, AIR, 3);
          for (const d of DIRS) this.updateNeighborsAt(rel(p, d));
        } else if (b.type === 'repeater') this.checkTickOnNeighbor(p, b);
        else this.cmpRefresh(p, b);
        break;
      case 'piston': case 'sticky_piston': this.checkIfExtend(p, b); break;
      case 'hopper': this.hopperPowered(p, b); break;
      case 'tnt':
        if (this.hasNeighborSignal(p)) this.primeTnt(p);
        break;
      case 'iron_door': {
        if (this.get(from).type === 'iron_door') break;
        const on = this.hasNeighborSignal(p) || this.hasNeighborSignal(rel(p, b.p.half === 'lower' ? 'up' : 'down'));
        if (on !== b.p.powered) this.setBlock(p, { type: b.type, p: { ...b.p, powered: on, open: on } }, 2);
        break;
      }
      case 'stone_pressure_plate':
        if (!this.canSurvive(p, b)) this.setBlock(p, AIR, 3);
        break;
      case 'dropper': case 'dispenser': {
        const sig = this.hasNeighborSignal(p) || this.hasNeighborSignal(rel(p, 'up'));
        if (sig && !b.p.triggered) {
          this.scheduleTick(p, 4, 0);
          this.setBlock(p, { type: b.type, p: { ...b.p, triggered: true } }, 4);
        } else if (!sig && b.p.triggered) {
          this.setBlock(p, { type: b.type, p: { ...b.p, triggered: false } }, 4);
        }
        break;
      }
      case 'piston_head':
        if (this.headCanSurvive(p, b)) {
          const bp = rel(p, opposite(b.p.facing));
          this.neighborChanged(bp, from);
        }
        break;
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
      case 'repeater': case 'comparator': this.updateNeighborsInFront(p, b); break;
      case 'piston': case 'sticky_piston':
        if (old.type !== b.type && !this.ents.has(key(p))) this.checkIfExtend(p, b);
        break;
      case 'hopper': if (old.type !== b.type) this.hopperPowered(p, b); break;
      case 'tnt': if (old.type !== b.type && this.hasNeighborSignal(p)) this.primeTnt(p); break;
    }
  }

  private onRemove(p: Pos, old: Block, _nw: Block, moving: boolean): void {
    switch (old.type) {
      case 'redstone_wire': case 'redstone_torch': case 'redstone_wall_torch':
        if (!moving) for (const d of DIRS) this.updateNeighborsAt(rel(p, d));
        break;
      case 'repeater': case 'comparator': case 'observer':
        if (!moving) {
          if (old.type === 'observer') {
            if (old.p.powered && this.hasTick(p)) this.updateNeighborsInFront(p, { ...old, p: { ...old.p, powered: false } });
          } else this.updateNeighborsInFront(p, old);
        }
        break;
      case 'lever': case 'stone_button':
        if (!moving && old.p.powered) this.attachedUpdate(p, old);
        break;
      case 'piston_head': {
        const bp = rel(p, opposite(old.p.facing));
        const base = this.get(bp);
        if (isPistonType(base) && base.p.extended && base.p.facing === old.p.facing &&
            base.type === (old.p.type === 'sticky' ? 'sticky_piston' : 'piston')) this.setBlock(bp, AIR, 3);
        break;
      }
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
      case 'repeater': case 'comparator': case 'observer': return this.blockSignal(b, p, dir);
      case 'stone_pressure_plate': return dir === 'up' ? this.blockSignal(b, p, dir) : 0;
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
      case 'lever': case 'stone_button': case 'stone_pressure_plate': return b.p.powered ? 15 : 0;
      case 'redstone_torch': return b.p.lit && dir !== 'up' ? 15 : 0;
      case 'redstone_wall_torch': return b.p.lit && b.p.facing !== dir ? 15 : 0;
      case 'repeater': return b.p.powered && b.p.facing === dir ? 15 : 0;
      case 'observer': return b.p.powered && b.p.facing === dir ? 15 : 0;
      case 'comparator': return b.p.powered && b.p.facing === dir ? (b.p.output ?? 0) : 0;
      case 'redstone_wire': {
        if (!this.wireShouldSignal || dir === 'down') return 0;
        const power: number = b.p.power;
        if (power === 0) return 0;
        if (dir === 'up') return power;
        return b.p[opposite(dir) as string] !== 'none' ? power : 0;
      }
      default: return 0;
    }
  }

  // ---------- redstone wire ----------
  private wireConnectsTo(b: Block, dir: Dir | null): boolean {
    if (b.type === 'redstone_wire') return true;
    if (b.type === 'repeater') return dir !== null && (b.p.facing === dir || opposite(b.p.facing) === dir);
    if (b.type === 'observer') return dir !== null && b.p.facing === dir;
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

  // Wire shape is stored state (north/east/south/west = none|side|up), ported from MCHPRS's
  // wire module: a lone wire is a "cross" (powers all four sides); only right-click makes a "dot".
  private sidesOf(b: Block): Record<string, Conn> {
    return { north: b.p.north, east: b.p.east, south: b.p.south, west: b.p.west };
  }
  private sidesDot(c: Record<string, Conn>): boolean { return HORIZONTAL.every((d) => c[d] === 'none'); }
  private sidesCross(): Record<string, Conn> { return { north: 'side', east: 'side', south: 'side', west: 'side' }; }
  private sidesIsCross(c: Record<string, Conn>): boolean { return HORIZONTAL.every((d) => c[d] === 'side'); }
  private wireAllSides(p: Pos): Record<string, Conn> {
    const above = !this.isConductor(rel(p, 'up'));
    const c: Record<string, Conn> = {};
    for (const d of HORIZONTAL) c[d] = this.connectingSide(p, d, above);
    return c;
  }
  /** get_regulated_sides: recompute from the world, then extend lone connections into lines. */
  private wireRegulate(inp: Record<string, Conn>, p: Pos): Record<string, Conn> {
    const st = this.wireAllSides(p);
    if (this.sidesDot(inp) && this.sidesDot(st)) return st;
    const nN = st.north === 'none', nS = st.south === 'none', nE = st.east === 'none', nW = st.west === 'none';
    const ns = nN && nS, ew = nE && nW;
    if (nN && ew) st.north = 'side';
    if (nS && ew) st.south = 'side';
    if (nE && ns) st.east = 'side';
    if (nW && ns) st.west = 'side';
    return st;
  }
  private wireShapeUpdate(q: Pos, b: Block, d: Dir, sf: number): void {
    const old = this.sidesOf(b);
    const ns = this.connectingSide(q, d, !this.isConductor(rel(q, 'up')));
    let nw = this.wireRegulate({ ...old, [d]: ns }, q);
    if (this.sidesIsCross(old) && ns === 'none') nw = old;
    else if (!this.sidesDot(old) && this.sidesDot(nw)) nw = this.sidesCross();
    if (HORIZONTAL.some((x) => nw[x] !== old[x])) this.setBlock(q, { type: b.type, p: { ...b.p, ...nw } }, sf);
  }
  private wireToggle(p: Pos, b: Block): void {
    const old = this.sidesOf(b);
    if (!this.sidesDot(old) && !this.sidesIsCross(old)) return;
    const start = this.sidesIsCross(old)
      ? { north: 'none', east: 'none', south: 'none', west: 'none' } as Record<string, Conn>
      : this.sidesCross();
    const nw = this.wireRegulate(start, p);
    if (HORIZONTAL.some((x) => nw[x] !== old[x])) this.setBlock(p, { type: b.type, p: { ...b.p, ...nw } }, 3);
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
  private isDiode(b: Block): boolean { return b.type === 'repeater' || b.type === 'comparator'; }

  private diodeInput(p: Pos, b: Block): number {
    const d: Dir = b.p.facing;
    const q = rel(p, d);
    const i = this.getSignal(q, d);
    if (i >= 15) return i;
    return Math.max(i, this.wirePower(this.get(q)));
  }
  private diodeShouldTurnOn(p: Pos, b: Block): boolean { return this.diodeInput(p, b) > 0; }

  /** DiodeBlock.getAlternateSignal: strongest side input. */
  private alternateSignal(p: Pos, b: Block, onlyDiodes: boolean): number {
    let m = 0;
    for (const d of [clockwise(b.p.facing as Dir), counterClockwise(b.p.facing as Dir)]) {
      const q = rel(p, d);
      const nb = this.get(q);
      if (onlyDiodes && !this.isDiode(nb)) continue;
      if (!def(nb).source) continue;
      m = Math.max(m, nb.type === 'redstone_block' ? 15 : nb.type === 'redstone_wire' ? nb.p.power : this.getDirectSignal(q, d));
    }
    return m;
  }
  private diodeLocked(p: Pos, b: Block): boolean { return this.alternateSignal(p, b, true) > 0; }

  private checkTickOnNeighbor(p: Pos, b: Block): void {
    if (this.diodeLocked(p, b)) return;
    const powered: boolean = b.p.powered;
    const should = this.diodeShouldTurnOn(p, b);
    if (powered !== should && !this.willTickThisTick(p)) {
      let prio: Prio = -1;
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

  // ---------- pressure plate / TNT ----------
  private plateCheck(p: Pos): void {
    const b = this.get(p);
    if (b.type !== 'stone_pressure_plate') return;
    const held = this.held.has(key(p));
    if (held) {
      if (!b.p.powered) {
        this.setBlock(p, { type: b.type, p: { ...b.p, powered: true } }, 3);
        this.updateNeighborsAt(p);
        this.updateNeighborsAt(rel(p, 'down'));
      }
      this.scheduleTick(p, 20, 0);
    } else if (b.p.powered) {
      this.setBlock(p, { type: b.type, p: { ...b.p, powered: false } }, 3);
      this.updateNeighborsAt(p);
      this.updateNeighborsAt(rel(p, 'down'));
    }
  }

  private primeTnt(p: Pos): void {
    this.log.push({ tick: this.time, event: 'tnt_primed', pos: p });
    this.setBlock(p, AIR, 3);
  }

  // ---------- comparator ----------
  private hasAnalog(b: Block): boolean { return b.type in CONTAINER_SIZE; }
  private analog(b: Block, p: Pos): number {
    if (b.p.signal !== undefined) return b.p.signal; // manual override
    const be = this.bes.get(key(p));
    if (!be) return 0;
    let f = 0, used = 0;
    for (const it of be.inv) {
      if (!it) continue;
      f = Math.fround(f + Math.fround(it.count / Math.min(64, maxStack(it.id))));
      used++;
    }
    f = Math.fround(f / be.inv.length);
    return Math.floor(Math.fround(f * 14)) + (used > 0 ? 1 : 0);
  }

  private cmpInput(p: Pos, b: Block): number {
    let i = this.diodeInput(p, b);
    const d: Dir = b.p.facing;
    let q = rel(p, d);
    let nb = this.get(q);
    if (this.hasAnalog(nb)) i = this.analog(nb, q);
    else if (i < 15 && def(nb).conductor) {
      q = rel(q, d);
      nb = this.get(q);
      if (this.hasAnalog(nb)) i = this.analog(nb, q);
    }
    return i;
  }
  private cmpOutput(p: Pos, b: Block): number {
    const i = this.cmpInput(p, b);
    if (i === 0) return 0;
    const j = this.alternateSignal(p, b, false);
    if (j > i) return 0;
    return b.p.mode === 'subtract' ? i - j : i;
  }
  private cmpShouldTurnOn(p: Pos, b: Block): boolean {
    const i = this.cmpInput(p, b);
    if (i === 0) return false;
    const j = this.alternateSignal(p, b, false);
    return i > j || (i === j && b.p.mode === 'compare');
  }
  private cmpRefresh(p: Pos, b: Block): void {
    if (this.willTickThisTick(p)) return;
    const i = this.cmpOutput(p, b);
    const j = b.p.output ?? 0;
    if (i !== j || b.p.powered !== this.cmpShouldTurnOn(p, b)) {
      const front = this.get(rel(p, opposite(b.p.facing)));
      const prio: Prio = this.isDiode(front) && front.p.facing !== b.p.facing ? -1 : 0;
      this.scheduleTick(p, 2, prio);
    }
  }
  private cmpTick(p: Pos, b: Block): void {
    const i = this.cmpOutput(p, b);
    const j = b.p.output ?? 0;
    b.p.output = i;
    if (j !== i || b.p.mode === 'compare') {
      const should = this.cmpShouldTurnOn(p, b);
      if (b.p.powered && !should) this.setBlock(p, { type: b.type, p: { ...b.p, powered: false } }, 2);
      else if (!b.p.powered && should) this.setBlock(p, { type: b.type, p: { ...b.p, powered: true } }, 2);
      this.updateNeighborsInFront(p, this.get(p));
    }
  }

  // ---------- pistons ----------
  private headCanSurvive(p: Pos, h: Block): boolean {
    const b = this.get(rel(p, opposite(h.p.facing)));
    const fitting = isPistonType(b) && b.p.extended && b.p.facing === h.p.facing &&
      b.type === (h.p.type === 'sticky' ? 'sticky_piston' : 'piston');
    return fitting || (b.type === 'moving_piston' && b.p.facing === h.p.facing);
  }

  private pistonSignal(p: Pos, facing: Dir): boolean {
    for (const d of DIRS) if (d !== facing && this.hasSignal(rel(p, d), d)) return true;
    if (this.hasSignal(p, 'down')) return true;
    const above = rel(p, 'up');
    for (const d of DIRS) if (d !== 'down' && this.hasSignal(rel(above, d), d)) return true;
    return false;
  }

  private blockEvent(pos: Pos, id: number, dir: Dir): void {
    if (this.events.some((e) => e.id === id && e.dir === dir && key(e.pos) === key(pos))) return;
    this.events.push({ pos, id, dir });
  }

  private checkIfExtend(p: Pos, b: Block): void {
    const d: Dir = b.p.facing;
    const sig = this.pistonSignal(p, d);
    if (sig && !b.p.extended) {
      if (this.resolve(p, d, true)) this.blockEvent(p, 0, d);
    } else if (!sig && b.p.extended) {
      const q = rel(rel(p, d), d);
      const nb = this.get(q);
      let id = 1;
      const e = this.ents.get(key(q));
      if (nb.type === 'moving_piston' && e && e.dir === d && e.extending &&
          (e.progress < 0.5 || this.time === e.lastTicked || this.handlingTick)) id = 2;
      this.blockEvent(p, id, d);
    }
  }

  private pistonEvent(ev: { pos: Pos; id: number; dir: Dir }): void {
    const p = ev.pos, id = ev.id;
    const b = this.get(p);
    if (!isPistonType(b)) return;
    const sticky = b.type === 'sticky_piston';
    const d: Dir = b.p.facing;
    const sig = this.pistonSignal(p, d);
    if (sig && (id === 1 || id === 2)) {
      this.setBlock(p, { type: b.type, p: { ...b.p, extended: true } }, 2);
      return;
    }
    if (!sig && id === 0) return;
    if (id === 0) {
      if (!this.moveBlocks(p, d, true)) return;
      this.setBlock(p, { type: b.type, p: { ...b.p, extended: true } }, 67);
    } else {
      const hp = rel(p, d);
      if (this.ents.has(key(hp))) this.finalTick(hp);
      this.setBlock(p, { type: 'moving_piston', p: { facing: d, type: sticky ? 'sticky' : 'normal' } }, 20);
      this.addMoving(p, { type: b.type, p: { facing: d, extended: false } }, d, false, true);
      this.updateNeighborsAt(p);
      this.updateNeighbourShapes(p);
      if (sticky) {
        const q = rel(hp, d);
        const bs1 = this.get(q);
        let handled = false;
        if (bs1.type === 'moving_piston') {
          const e = this.ents.get(key(q));
          if (e && e.dir === d && e.extending) { this.finalTick(q); handled = true; }
        }
        if (!handled) {
          if (id === 1 && bs1.type !== 'air' && this.isPushable(bs1, q, opposite(d), false, d) &&
              (!DESTROY.has(bs1.type) && !BLOCKING.has(bs1.type) || isPistonType(bs1))) this.moveBlocks(p, d, false);
          else this.setBlock(hp, AIR, 3);
        }
      } else this.setBlock(hp, AIR, 3);
    }
  }

  private isPushable(b: Block, p: Pos, moveDir: Dir, allowDestroy: boolean, pistonFacing: Dir): boolean {
    if (p[1] < MIN_Y || p[1] > MAX_Y - 1) return false;
    if (b.type === 'air') return true;
    if (moveDir === 'down' && p[1] === MIN_Y) return false;
    if (moveDir === 'up' && p[1] === MAX_Y - 1) return false;
    if (!isPistonType(b)) {
      if (BLOCKING.has(b.type)) return false;
      if (DESTROY.has(b.type)) return allowDestroy;
    } else if (b.p.extended) return false;
    void pistonFacing;
    return !BLOCK_ENTITY.has(b.type);
  }

  /** PistonStructureResolver. */
  private resolve(pistonPos: Pos, pistonDir: Dir, extending: boolean): { push: Pos[]; destroy: Pos[] } | null {
    const pushDir = extending ? pistonDir : opposite(pistonDir);
    const startPos = extending ? rel(pistonPos, pistonDir) : rel(rel(pistonPos, pistonDir), pistonDir);
    const toPush: Pos[] = [];
    const toDestroy: Pos[] = [];
    const idx = (q: Pos) => toPush.findIndex((e) => key(e) === key(q));
    const sticky = (q: Pos) => ['slime_block', 'honey_block'].includes(this.get(q).type);
    const stick = (a: Pos, b: Pos) => {
      const ta = this.get(a).type, tb = this.get(b).type;
      if ((ta === 'honey_block' && tb === 'slime_block') || (ta === 'slime_block' && tb === 'honey_block')) return false;
      return sticky(a) || sticky(b);
    };
    const same = (a: Pos, b: Pos) => key(a) === key(b);

    // axis test: d.axis != pushDir.axis
    const axis = (d: Dir) => (d === 'up' || d === 'down' ? 'y' : d === 'east' || d === 'west' ? 'x' : 'z');
    const addBranching2 = (q: Pos): boolean => {
      for (const d of DIRS) {
        if (axis(d) !== axis(pushDir)) {
          const q1 = rel(q, d);
          if (stick(q1, q) && !addBlockLine(q1, d)) return false;
        }
      }
      return true;
    };

    const addBlockLine = (start: Pos, dir: Dir): boolean => {
      let bs = this.get(start);
      if (bs.type === 'air') return true;
      if (!this.isPushable(bs, start, pushDir, false, dir)) return true;
      if (same(start, pistonPos)) return true;
      if (idx(start) > -1) return true;
      const walk = (from: Pos, d: Dir, n: number): Pos => { let r = from; for (let m = 0; m < n; m++) r = rel(r, d); return r; };
      let i = 1;
      if (i + toPush.length > 12) return false;
      while (sticky(walk(start, opposite(pushDir), i - 1))) {
        const q = walk(start, opposite(pushDir), i);
        bs = this.get(q);
        if (bs.type === 'air' || !stick(walk(start, opposite(pushDir), i - 1), q) ||
            !this.isPushable(bs, q, pushDir, false, opposite(pushDir)) || same(q, pistonPos)) break;
        if (++i + toPush.length > 12) return false;
      }
      let l = 0;
      for (let i1 = i - 1; i1 >= 0; i1--) { toPush.push(walk(start, opposite(pushDir), i1)); l++; }
      let j1 = 1;
      for (;;) {
        const p1 = walk(start, pushDir, j1);
        const k = idx(p1);
        if (k > -1) {
          // reorderListAtCollision(l, k)
          const first = toPush.slice(0, k);
          const last = toPush.slice(toPush.length - l);
          const mid = toPush.slice(k, toPush.length - l);
          toPush.length = 0;
          toPush.push(...first, ...last, ...mid);
          for (let l1 = 0; l1 <= k + l; l1++) {
            const p2 = toPush[l1];
            if (sticky(p2) && !addBranching2(p2)) return false;
          }
          return true;
        }
        const b1 = this.get(p1);
        if (b1.type === 'air') return true;
        if (!this.isPushable(b1, p1, pushDir, true, pushDir) || same(p1, pistonPos)) return false;
        if (DESTROY.has(b1.type)) { toDestroy.push(p1); return true; }
        if (toPush.length >= 12) return false;
        toPush.push(p1); l++; j1++;
      }
    };

    const bs = this.get(startPos);
    if (!this.isPushable(bs, startPos, pushDir, false, pistonDir)) {
      if (extending && DESTROY.has(bs.type)) { toDestroy.push(startPos); return { push: toPush, destroy: toDestroy }; }
      return null;
    }
    if (!addBlockLine(startPos, pushDir)) return null;
    for (let i = 0; i < toPush.length; i++) {
      const q = toPush[i];
      if (sticky(q) && !addBranching2(q)) return null;
    }
    return { push: toPush, destroy: toDestroy };
  }

  private moveBlocks(p: Pos, d: Dir, extending: boolean): boolean {
    const base = this.get(p);
    const stickyType = base.type === 'sticky_piston' ? 'sticky' : 'normal';
    const headPos = rel(p, d);
    if (!extending && this.get(headPos).type === 'piston_head') this.setBlock(headPos, AIR, 20);
    const r = this.resolve(p, d, extending);
    if (!r) return false;
    const { push, destroy } = r;
    const olds = push.map((q) => this.get(q));
    const vacated = new Map<string, Pos>();
    for (const q of push) vacated.set(key(q), q);
    const d1 = extending ? d : opposite(d);
    for (let j = destroy.length - 1; j >= 0; j--) this.setBlock(destroy[j], AIR, 18);
    for (let k = push.length - 1; k >= 0; k--) {
      const q = rel(push[k], d1);
      vacated.delete(key(q));
      this.setBlock(q, { type: 'moving_piston', p: { facing: d } }, 68);
      this.addMoving(q, olds[k], d, extending, false);
    }
    if (extending) {
      vacated.delete(key(headPos));
      this.setBlock(headPos, { type: 'moving_piston', p: { facing: d, type: stickyType } }, 68);
      this.addMoving(headPos, { type: 'piston_head', p: { facing: d, type: stickyType } }, d, true, true);
    }
    const order = javaSetOrder([...vacated.values()]);
    for (const q of order) this.setBlock(q, AIR, 82);
    for (const q of order) this.updateNeighbourShapes(q);
    for (let j = destroy.length - 1; j >= 0; j--) this.updateNeighborsAt(destroy[j]);
    for (let k = push.length - 1; k >= 0; k--) this.updateNeighborsAt(push[k]);
    if (extending) this.updateNeighborsAt(headPos);
    return true;
  }

  private addMoving(p: Pos, moved: Block, dir: Dir, extending: boolean, isSource: boolean): void {
    this.ents.set(key(p), { seq: this.beSeq++, moved, dir, extending, isSource, progress: 0, progressO: 0, lastTicked: this.time });
  }

  private finishMoving(p: Pos, e: Moving, forced: boolean): void {
    this.ents.delete(key(p));
    if (this.get(p).type === 'moving_piston') {
      const nb = forced && e.isSource ? AIR : { type: e.moved.type, p: { ...e.moved.p } };
      this.setBlock(p, nb, 3);
      this.neighborChanged(p, p);
    }
  }
  private finalTick(p: Pos): void {
    const e = this.ents.get(key(p));
    if (e && e.progressO < 1) { e.progress = e.progressO = 1; this.finishMoving(p, e, true); }
  }
  private tickMoving(p: Pos, e: Moving): void {
    e.lastTicked = this.time;
    e.progressO = e.progress;
    if (e.progressO >= 1) this.finishMoving(p, e, false);
    else e.progress = Math.min(1, e.progress + 0.5);
  }

  /** Block entities tick in creation order (hoppers, moving pistons). */
  private tickBlockEntities(): void {
    const list: { seq: number; run: () => void }[] = [];
    for (const [k, e] of this.ents) {
      const p = k.split(',').map(Number) as Pos;
      list.push({ seq: e.seq, run: () => { if (this.ents.get(k) === e) this.tickMoving(p, e); } });
    }
    for (const [k, be] of this.bes) {
      if (be.type !== 'hopper') continue;
      const p = k.split(',').map(Number) as Pos;
      list.push({ seq: be.seq, run: () => { if (this.bes.get(k) === be) this.hopperTick(p, be); } });
    }
    list.sort((a, b) => a.seq - b.seq);
    for (const t of list) t.run();
  }

  // ---------- containers ----------
  private newBE(type: string, size: number, inv?: (Item | null | [string, number])[]): BE {
    const items: (Item | null)[] = Array(size).fill(null);
    (inv ?? []).slice(0, size).forEach((it, i) => {
      if (!it) return;
      const [id, count] = Array.isArray(it) ? it : [it.id, it.count];
      items[i] = { id: norm(id), count };
    });
    return { type, inv: items, cooldown: -1, ticked: -1, seq: this.beSeq++ };
  }

  /** Items in a container (null for empty slots). */
  items(p: Pos): (Item | null)[] | undefined { return this.bes.get(key(p))?.inv.map((i) => (i ? { ...i } : null)); }
  setItem(p: Pos, slot: number, item: Item | null): void {
    const be = this.bes.get(key(p));
    if (!be) throw new Error(`no container at ${p.join(',')}`);
    be.inv[slot] = item ? { id: norm(item.id), count: item.count } : null;
    this.updateComparatorsAround(p);
  }

  private updateComparatorsAround(p: Pos): void {
    for (const d of HORIZONTAL) {
      let q = rel(p, d);
      let nb = this.get(q);
      if (nb.type === 'comparator') this.neighborChanged(q, p);
      else if (def(nb).conductor) {
        q = rel(q, d);
        nb = this.get(q);
        if (nb.type === 'comparator') this.neighborChanged(q, p);
      }
    }
  }

  private isEmptyBE(be: BE): boolean { return be.inv.every((i) => !i); }
  private isFullBE(be: BE): boolean { return be.inv.every((i) => i && i.count >= maxStack(i.id)); }

  /** HopperBlockEntity.addItem for a single item; true if fully inserted. */
  private insertOne(srcBE: BE | null, destP: Pos, dest: BE, item: Item): boolean {
    for (let slot = 0; slot < dest.inv.length; slot++) {
      const cur = dest.inv[slot];
      const wasEmpty = this.isEmptyBE(dest);
      let moved = false;
      if (!cur) { dest.inv[slot] = { id: item.id, count: 1 }; moved = true; }
      else if (cur.id === item.id && cur.count < maxStack(cur.id)) { cur.count++; moved = true; }
      if (moved) {
        if (wasEmpty && dest.type === 'hopper' && dest.cooldown <= 8) {
          const k = srcBE && srcBE.type === 'hopper' && dest.ticked >= srcBE.ticked ? 1 : 0;
          dest.cooldown = 8 - k;
        }
        this.updateComparatorsAround(destP);
        return true;
      }
    }
    return false;
  }

  private takeOne(be: BE, slot: number, p: Pos): Item {
    const it = be.inv[slot]!;
    const one = { id: it.id, count: 1 };
    if (--it.count <= 0) be.inv[slot] = null;
    this.updateComparatorsAround(p);
    return one;
  }

  private hopperPowered(p: Pos, b: Block): void {
    const enabled = !this.hasNeighborSignal(p);
    if (enabled !== b.p.enabled) this.setBlock(p, { type: b.type, p: { ...b.p, enabled } }, 4);
  }

  private hopperTick(p: Pos, be: BE): void {
    be.cooldown--;
    be.ticked = this.time;
    if (be.cooldown > 0) return;
    be.cooldown = 0;
    const b = this.get(p);
    if (b.type !== 'hopper' || !b.p.enabled) return;
    let moved = false;
    if (!this.isEmptyBE(be)) moved = this.hopperEject(p, b, be);
    if (!this.isFullBE(be)) moved = this.hopperSuck(p, be) || moved;
    if (moved) {
      be.cooldown = 8;
      this.updateComparatorsAround(p);
    }
  }

  private hopperEject(p: Pos, b: Block, be: BE): boolean {
    const dp = rel(p, b.p.facing);
    const dest = this.bes.get(key(dp));
    if (!dest || this.isFullBE(dest)) return false;
    for (let i = 0; i < be.inv.length; i++) {
      if (!be.inv[i]) continue;
      const one = { id: be.inv[i]!.id, count: 1 };
      if (this.insertOne(be, dp, dest, one)) { this.takeOne(be, i, p); return true; }
    }
    return false;
  }

  private hopperSuck(p: Pos, be: BE): boolean {
    const sp = rel(p, 'up');
    const src = this.bes.get(key(sp));
    if (!src || this.isEmptyBE(src)) return false;
    for (let i = 0; i < src.inv.length; i++) {
      if (!src.inv[i]) continue;
      const one = { id: src.inv[i]!.id, count: 1 };
      if (this.insertOne(src, p, be, one)) { this.takeOne(src, i, sp); return true; }
    }
    return false;
  }

  private dispenseFrom(p: Pos, b: Block): void {
    const be = this.bes.get(key(p));
    if (!be) return;
    let slot = -1, j = 1;
    for (let k = 0; k < be.inv.length; k++) if (be.inv[k] && this.rng.nextInt(j++) === 0) slot = k;
    if (slot < 0) return;
    const d: Dir = b.p.facing;
    const fp = rel(p, d);
    const dest = this.bes.get(key(fp));
    const one = { id: be.inv[slot]!.id, count: 1 };
    if (b.type === 'dropper' && dest) {
      if (this.insertOne(be, fp, dest, one)) this.takeOne(be, slot, p);
    } else {
      this.takeOne(be, slot, p);
      this.drops.push({ tick: this.time, pos: fp, item: one });
    }
  }

  // ---------- inspection ----------
  /** Value of a state property (`power`, `lit`, `powered`, ...) at a position. */
  read(p: Pos, prop: string): any {
    const b = this.get(p);
    if (prop === 'type') return b.type;
    return b.p[prop];
  }

  /** All non-air blocks, sorted by y, z, x (for debugging). */
  listBlocks(): { pos: Pos; type: string; props: Record<string, any> }[] {
    return [...this.blocks.entries()]
      .map(([k, b]) => ({ pos: k.split(',').map(Number) as Pos, type: b.type, props: b.p }))
      .sort((a, b) => a.pos[1] - b.pos[1] || a.pos[2] - b.pos[2] || a.pos[0] - b.pos[0]);
  }
}
