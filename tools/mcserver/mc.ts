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
  for (const pass of [0, 1]) for (const b of blocks) {
    if (soft(b.type) !== (pass === 1)) continue;
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
export async function clickBlock(stand: Pos, target: Pos): Promise<void> {
  await rcon(`setblock ${stand[0]} ${stand[1] - 1} ${stand[2]} minecraft:obsidian`);
  const list = await rcon('player Lab list').catch(() => '');
  void list;
  await rcon(`player Lab spawn at ${at(stand)} facing 0 0 in minecraft:overworld`).catch(() => '');
  await rcon(`tp Lab ${at(stand)}`);
  await rcon(`player Lab look at ${target[0] + 0.5} ${target[1] + 0.5} ${target[2] + 0.5}`);
  await rcon('player Lab use once');
}

/** remove a finished build: air over the box, the bot's standing platform, and the fake player itself */
export async function cleanup(a: Pos, b: Pos, stands: Pos[] = []): Promise<void> {
  await clearBox(a, b);
  for (const st of stands) await rcon(`setblock ${st[0]} ${st[1] - 1} ${st[2]} minecraft:air`);
  await rcon('player Lab kill').catch(() => '');
}
