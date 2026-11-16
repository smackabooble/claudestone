/**
 * Real Minecraft server control (Fabric + Carpet, void world, started by tools/mcserver/start.sh). Talks RCON on 127.0.0.1:25575.
 *  rcon(cmd)                      run a command, returns the reply text
 *  pasteWorld(w, origin)          write every block of a simulator World into the real world (setblock, with neighbour updates off until done is NOT used: plain setblock)
 *  blockIs(pos, 'minecraft:redstone_lamp[lit=true]')   exact state test via `execute if block`
 *  clear(box)                     fill with air
 * Everything here is REAL game behaviour (Minecraft 26.3 + Carpet), unlike the simulator.
 */
import net from 'node:net';
import { toBlockState } from '../../src/export.ts';
import type { World } from '../../src/world.ts';
import type { Pos } from '../../src/dirs.ts';

export function rcon(cmd: string, host = '127.0.0.1', port = 25575, password = 'claudestone-local'): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, host);
    let buf = Buffer.alloc(0), authed = false;
    const pkt = (id: number, type: number, body: string) => { const b = Buffer.from(body, 'utf8'); const o = Buffer.alloc(14 + b.length); o.writeInt32LE(10 + b.length, 0); o.writeInt32LE(id, 4); o.writeInt32LE(type, 8); b.copy(o, 12); return o; };
    s.on('connect', () => s.write(pkt(1, 3, password)));
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 4) {
        const len = buf.readInt32LE(0); if (buf.length < 4 + len) break;
        const id = buf.readInt32LE(4), body = buf.subarray(12, 4 + len - 2).toString('utf8'); buf = buf.subarray(4 + len);
        if (!authed) { if (id === -1) { reject(new Error('rcon auth failed')); s.destroy(); return; } authed = true; s.write(pkt(2, 2, cmd)); }
        else { resolve(body); s.end(); return; }
      }
    });
    s.on('error', reject);
    setTimeout(() => { s.destroy(); reject(new Error('rcon timeout')); }, 15000);
  });
}

const at = (p: Pos) => `${p[0]} ${p[1]} ${p[2]}`;
/** `execute if block` exact state match */
export async function blockIs(p: Pos, state: string): Promise<boolean> { return (await rcon(`execute if block ${at(p)} ${state}`)).startsWith('Test passed'); }
export async function clearBox(a: Pos, b: Pos): Promise<void> { await rcon(`fill ${at(a)} ${at(b)} minecraft:air`); }

/** paste a simulator world with its blocks shifted by `origin` (inside the loaded area around the spawn) */
export async function pasteWorld(w: World, origin: Pos): Promise<number> {
  let n = 0;
  const blocks = w.listBlocks().filter((b) => b.type !== 'moving_piston');
  // supports/solid blocks first, so dust/torches/repeaters find their floor; the rest in a second pass
  const soft = (t: string) => ['redstone_wire', 'repeater', 'comparator', 'redstone_torch', 'redstone_wall_torch', 'lever', 'stone_button', 'redstone_lamp'].includes(t);
  // observers LAST: an observer placed before the block in front of it changes (dust/repeater/piston arriving) fires a pulse and starts the machine during the paste
  const pass = (b: { type: string }) => (b.type === 'observer' ? 2 : soft(b.type) ? 1 : 0);
  for (const ps of [0, 1, 2]) for (const b of blocks) {
    if (pass(b) !== ps) continue;
    if (ps === 2 && n > 0 && !(globalThis as any).__waited) { (globalThis as any).__waited = true; await new Promise((r) => setTimeout(r, 1500)); }   // let the scheduled ticks of the freshly placed repeaters/pistons run BEFORE observers exist (otherwise they look like changes and start the machine)
    const p: Pos = [b.pos[0] + origin[0], b.pos[1] + origin[1], b.pos[2] + origin[2]];
    const r = await rcon(`setblock ${at(p)} ${toBlockState({ type: b.type, p: b.props })} replace`);
    if (!/Changed the block|Could not set the block/.test(r)) throw new Error(`setblock failed at ${at(p)}: ${r}`);
    n++;
  }
  return n;
}

/**
 * Click a block like a PLAYER (Carpet fake player "Lab"). `setblock` on a lever does NOT update the block it is attached to (no strong-power update), so real
 * redstone ignores it: always flip levers/buttons with this. `stand` = where the bot stands (an obsidian platform is put under it), it must be within ~4 blocks of `target`.
 */
export async function clickBlock(stand0: Pos, target: Pos, exactStand = false): Promise<void> {
  const stand: Pos = exactStand ? stand0 : [stand0[0], target[1] - 1, stand0[2]];   // the bot must stand one level BELOW a floor lever (clicks from the same level or above missed it in the real game); only x/z of `stand0` matter
  await rcon(`setblock ${stand[0]} ${stand[1] - 1} ${stand[2]} minecraft:obsidian`);
  // (re)spawn the bot and wait until it exists: right after `player Lab kill` the name is still taken for a moment and the spawn silently fails
  for (let i = 0; i < 10; i++) {
    if ((await rcon('execute if entity Lab')).startsWith('Test passed')) break;
    await rcon(`player Lab spawn at ${at(stand)} facing 0 0 in minecraft:overworld`).catch(() => '');
    await new Promise((r) => setTimeout(r, 700));
  }
  await rcon(`tp Lab ${at(stand)}`);
  await new Promise((r) => setTimeout(r, 300));
  const stateOf = async () => (await rcon(`script run print(block_state(${target.join(",")}))`)).match(/\{.*?\}/)?.[0] ?? '';
  const before = await stateOf();
  const wall = /face: wall/.test(before);
  // aim at the middle of the HITBOX: floor lever near the bottom, ceiling near the top, wall lever pushed back towards its wall (a ray at the block centre passes in front of it)
  const face = before.match(/face: (\w+)/)?.[1] ?? 'floor', facing = before.match(/facing: (\w+)/)?.[1] ?? 'north';
  const F: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
  const [fx, fz] = F[facing] ?? [0, 0];
  const aims: [number, number, number][] = face === 'wall' ? [[0.5 - 0.3 * fx, 0.5, 0.5 - 0.3 * fz], [0.5 - 0.2 * fx, 0.45, 0.5 - 0.2 * fz]] : face === 'ceiling' ? [[0.5, 0.85, 0.5], [0.5, 0.75, 0.5]] : [[0.5, 0.15, 0.5], [0.5, 0.25, 0.5]];
  for (const [ax, ay, az] of aims) {
    await rcon(`player Lab look at ${target[0] + ax} ${target[1] + ay} ${target[2] + az}`);
    await new Promise((r) => setTimeout(r, 250));      // the new rotation is only applied on the bot's next tick: clicking at once uses the OLD aim (that was the flakiness)
    await rcon('player Lab use once');
    await new Promise((r) => setTimeout(r, 600));
    const after = await stateOf(); if (process.env.MC_DEBUG) console.log('  click aim', ax, ay, az, before, '->', after);
    if (after !== before) return;
  }
}

/** remove a finished build: air over the box, the bot's standing platform, and the fake player itself */
export async function cleanup(a: Pos, b: Pos, stands: Pos[] = []): Promise<void> {
  await clearBox(a, b);
  for (const st of stands) await rcon(`setblock ${st[0]} ${st[1] - 1} ${st[2]} minecraft:air`);
  await rcon('player Lab kill').catch(() => '');
}

/**
 * Pull a lever WITHOUT the bot, in the phase where a real player's click is handled (between game ticks, like a network packet): toggle `powered` with the same flags as LeverBlock.pull
 * and notify the neighbours of the block it is attached to (`update`), which setblock alone does not do. A bot click runs inside the entity phase of the tick instead and starts pistons 1 tick later.
 */
export async function pullLever(p: Pos): Promise<void> {
  const st = (await rcon(`script run print(block_state(${p.join(',')}))`)).match(/\{(.*?)\}/)?.[1] ?? '';
  const get = (k: string) => st.match(new RegExp(`${k}: (\\w+)`))?.[1] ?? '';
  const face = get('face'), facing = get('facing'), powered = get('powered') === 'true';
  const F: Record<string, [number, number, number]> = { north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] };
  const att: Pos = face === 'floor' ? [p[0], p[1] - 1, p[2]] : face === 'ceiling' ? [p[0], p[1] + 1, p[2]] : [p[0] - F[facing][0], p[1], p[2] - F[facing][2]];
  await rcon(`script run set(${p.join(',')}, 'lever', {'face'->'${face}','facing'->'${facing}','powered'->${!powered}}); update(${att.join(',')})`);
}

/** paste cells (vanilla state strings, real coordinates) + container items EXACTLY, without any block update (tools/mcserver/paste.sc): a running machine's snapshot stays as it was */
export async function pasteNoUpdates(cells: { pos: Pos; state: string }[], items: { pos: Pos; slot: number; id: string; count: number }[] = [], tag = 'paste1'): Promise<number> {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const dir = '/home/user/mcserver/world/scripts/paste.data'; mkdirSync(dir, { recursive: true });
  const lines: string[] = [];
  for (const c of cells) { const m = c.state.match(/^minecraft:([a-z_0-9]+)(?:\[(.*)\])?$/)!; lines.push(`${c.pos.join(' ')} ${m[1]}${m[2] ? ' ' + m[2] : ''}`); }
  for (const i of items) lines.push(`V ${i.pos.join(' ')} ${i.slot} ${i.id} ${i.count}`);
  writeFileSync(`${dir}/${tag}.txt`, lines.join('\n') + '\n');
  await rcon('script unload paste').catch(() => ''); await rcon('script load paste');
  const r = await rcon(`paste ${tag}`);
  return Number(r.match(/(\d+)/)?.[1] ?? 0);
}
