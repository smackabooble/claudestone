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
export async function clickBlock(stand0: Pos, target: Pos): Promise<void> {
  const stand: Pos = [stand0[0], target[1] - 1, stand0[2]];   // the bot must stand one level BELOW a floor lever (clicks from the same level or above missed it in the real game); only x/z of `stand0` matter
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
  // wall levers/buttons are hit near the middle of the block, floor ones near the bottom. One click, verify, one retry with the other aim (never more: every hit toggles)
  // the bot must stand 2 blocks from the lever: from 1 block away the aim ray passes just above the lever hitbox
  for (const dy of wall ? [0.5, 0.25] : [0.15, 0.25]) {
    await rcon(`player Lab look at ${target[0] + 0.5} ${target[1] + dy} ${target[2] + 0.5}`);
    await new Promise((r) => setTimeout(r, 250));      // the new rotation is only applied on the bot's next tick: clicking at once uses the OLD aim (that was the flakiness)
    await rcon('player Lab use once');
    await new Promise((r) => setTimeout(r, 600));
    const after = await stateOf(); if (process.env.MC_DEBUG) console.log("  click dy", dy, before, "->", after);
    if (after !== before) return;
  }
}

/** remove a finished build: air over the box, the bot's standing platform, and the fake player itself */
export async function cleanup(a: Pos, b: Pos, stands: Pos[] = []): Promise<void> {
  await clearBox(a, b);
  for (const st of stands) await rcon(`setblock ${st[0]} ${st[1] - 1} ${st[2]} minecraft:air`);
  await rcon('player Lab kill').catch(() => '');
}
