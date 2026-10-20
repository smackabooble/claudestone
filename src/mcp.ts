#!/usr/bin/env node
/** MCP server (stdio): a persistent headless redstone world Claude can build in, run and inspect. */
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { World } from './world.ts';
import { JavaRandom } from './jrandom.ts';
import { loadSchematic } from './schematic.ts';
import { simulate } from './sim.ts';
import { exportSchem } from './export.ts';
import { writeFileSync } from 'node:fs';
import { LEGEND, bounds, render } from './view.ts';
import type { Pos } from './dirs.ts';

let world = new World();
const pos = z.tuple([z.number().int(), z.number().int(), z.number().int()]).describe('[x, y, z]; y is up, north = -z, east = +x');
const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 1));
const fail = (e: unknown) => ({ ...text(`error: ${(e as Error).message}`), isError: true });
const guard = <A>(f: (a: A) => ReturnType<typeof text>) => (a: A) => { try { return f(a); } catch (e) { return fail(e); } };

const server = new McpServer({ name: 'claudestone', version: '0.1.0' });

server.registerTool('reset', {
  description: 'Start a fresh empty world (game time 0). Optional seed for dropper/dispenser slot randomness.',
  inputSchema: { seed: z.number().int().optional() },
}, guard(({ seed }) => { world = new World(); if (seed !== undefined) world.rng = new JavaRandom(seed); return text('new world'); }));

server.registerTool('place', {
  description:
    'Place blocks in order, like a player (neighbor updates run). Place supports first (wire/torch/repeater need a solid block below). ' +
    'Types: stone glass obsidian slime_block redstone_block redstone_wire lever stone_button redstone_torch redstone_wall_torch ' +
    'repeater comparator observer redstone_lamp piston sticky_piston hopper dropper dispenser chest barrel. ' +
    'props: repeater/comparator `facing`=INPUT side (+delay 1-4, mode compare|subtract); observer/piston/hopper/dropper `facing`; ' +
    'lever/button `face` floor|wall|ceiling + `facing`; wall torch `facing`=away from wall; containers `inv`=[{id,count}|null,...].',
  inputSchema: { blocks: z.array(z.object({ pos, type: z.string(), props: z.record(z.string(), z.any()).optional() })) },
}, guard(({ blocks }) => { for (const b of blocks) world.place(b.pos as Pos, b.type, b.props); return text(`placed ${blocks.length}`); }));

server.registerTool('fill', {
  description: 'Place the same block at every position in the box from..to (inclusive), x then z then y ascending.',
  inputSchema: { from: pos, to: pos, type: z.string(), props: z.record(z.string(), z.any()).optional() },
}, guard(({ from, to, type, props }) => {
  let n = 0;
  for (let y = Math.min(from[1], to[1]); y <= Math.max(from[1], to[1]); y++)
    for (let zz = Math.min(from[2], to[2]); zz <= Math.max(from[2], to[2]); zz++)
      for (let x = Math.min(from[0], to[0]); x <= Math.max(from[0], to[0]); x++) { world.place([x, y, zz], type, props); n++; }
  return text(`placed ${n}`);
}));

server.registerTool('remove', {
  description: 'Break blocks (neighbor updates run).',
  inputSchema: { positions: z.array(pos) },
}, guard(({ positions }) => { for (const p of positions) world.remove(p as Pos); return text(`removed ${positions.length}`); }));

server.registerTool('use', {
  description: 'Right-click: toggle a lever, press a button, cycle repeater delay, toggle comparator mode.',
  inputSchema: { pos },
}, guard(({ pos: p }) => { world.use(p as Pos); return text(`used ${p.join(',')}`); }));

server.registerTool('step', {
  description:
    'Advance N game ticks (20/s; 1 redstone tick = 2 game ticks). `watch` lists values to track; returns every change with its tick. ' +
    'Optional `actions` right-click blocks at the END of a given relative tick (1 = first step).',
  inputSchema: {
    ticks: z.number().int().min(1).max(100000),
    watch: z.array(z.object({ name: z.string(), pos, prop: z.string().optional() })).optional(),
    actions: z.array(z.object({ tick: z.number().int().min(1), use: pos })).optional(),
  },
}, guard(({ ticks, watch = [], actions = [] }) => {
  const last = new Map<string, unknown>();
  const out: string[] = [];
  const sample = (t: number) => {
    for (const w of watch) {
      const b = world.get(w.pos as Pos);
      const prop = w.prop ?? (b.type === 'redstone_wire' ? 'power' : b.type === 'comparator' ? 'output' : b.type.endsWith('piston') ? 'extended' : b.type === 'redstone_lamp' || b.type.includes('torch') ? 'lit' : 'powered');
      const v = world.read(w.pos as Pos, prop);
      if (!last.has(w.name) || last.get(w.name) !== v) { out.push(`t+${t} ${w.name}=${v}`); last.set(w.name, v); }
    }
  };
  sample(0);
  for (let t = 1; t <= ticks; t++) {
    world.step(() => { for (const a of actions) if (a.tick === t) world.use(a.use as Pos); });
    sample(t);
  }
  return text(`${out.join('\n') || '(no watched changes)'}\ngame time: ${world.time}`);
}));

server.registerTool('read', {
  description: 'Block state at a position (type + properties), plus container items if any.',
  inputSchema: { pos },
}, guard(({ pos: p }) => {
  const b = world.get(p as Pos);
  return json({ type: b.type, props: b.p, items: world.items(p as Pos)?.map((i, n) => (i ? { slot: n, ...i } : null)).filter(Boolean) });
}));

server.registerTool('view', {
  description: 'ASCII render of the world (or a box). One grid per y layer, rows = z (north on top), columns = x. Includes a legend.',
  inputSchema: { min: pos.optional(), max: pos.optional() },
}, guard(({ min, max }) => {
  const bb = bounds(world);
  if (!bb && !min) return text('(empty world)');
  return text(`${render(world, (min ?? bb!.min) as Pos, (max ?? bb!.max) as Pos)}\n${LEGEND}`);
}));

server.registerTool('set_item', {
  description: 'Set a container slot (item null clears). Updates comparators.',
  inputSchema: { pos, slot: z.number().int().min(0), item: z.object({ id: z.string(), count: z.number().int().min(1) }).nullable() },
}, guard(({ pos: p, slot, item }) => { world.setItem(p as Pos, slot, item); return text('ok'); }));

server.registerTool('load_schematic', {
  description: 'Paste a .schem (Sponge v2/v3) or .litematic file into the current world at an origin, keeping every block state exactly as saved and running no updates (like a real paste). Unsupported blocks become stone with warnings.',
  inputSchema: { path: z.string(), origin: pos.optional() },
}, guard(({ path, origin }) => {
  const sch = loadSchematic(readFileSync(path));
  const [ox, oy, oz] = origin ?? [0, 0, 0];
  const warnings = [...sch.warnings];
  for (const b of sch.blocks) {
    try { world.setRaw([b.pos[0] + ox, b.pos[1] + oy, b.pos[2] + oz], b.type, b.props); }
    catch (e) { warnings.push(`skipped ${b.type} at ${b.pos.join(',')}: ${(e as Error).message}`); }
  }
  return text(`size ${sch.size.join('x')}, ${sch.blocks.length} blocks\n${warnings.slice(0, 40).join('\n')}`);
}));

server.registerTool('export_schematic', {
  description: 'Write the current world as a Sponge .schem (Minecraft 1.20.1, loads in WorldEdit/Litematica). Returns size and the min-corner origin used.',
  inputSchema: { path: z.string() },
}, guard(({ path }) => {
  const r = exportSchem(world);
  writeFileSync(path, r.buffer);
  return text(`wrote ${path}: size ${r.size.join('x')}, world origin of schematic (0,0,0) = ${r.origin.join(',')}`);
}));

server.registerTool('run_spec', {
  description: 'One-shot: simulate a full spec {blocks, script, probes, expect, ticks} in a fresh world (does not touch the current world). Returns timeline and failed expectations.',
  inputSchema: { spec: z.any() },
}, guard(({ spec }) => {
  const r = simulate(spec);
  return text(`${r.timeline.join('\n')}\n${r.failures.length ? `FAILED:\n${r.failures.join('\n')}` : 'expectations ok'}${r.warnings.length ? `\nwarnings:\n${r.warnings.join('\n')}` : ''}`);
}));

await server.connect(new StdioServerTransport());
