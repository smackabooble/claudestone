import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('MCP server: build, step, view over stdio', async () => {
  const client = new Client({ name: 't', version: '0' });
  await client.connect(new StdioClientTransport({ command: 'npx', args: ['tsx', 'src/mcp.ts'] }));
  const call = async (name: string, args: any) =>
    ((await client.callTool({ name, arguments: args })) as any).content[0].text as string;

  const tools = (await client.listTools()).tools.map((t) => t.name);
  assert.ok(['place', 'step', 'view', 'use', 'run_spec'].every((t) => tools.includes(t)));

  await call('fill', { from: [0, 0, 0], to: [3, 0, 0], type: 'stone' });
  await call('place', { blocks: [
    { pos: [0, 1, 0], type: 'lever', props: { face: 'floor' } },
    { pos: [1, 1, 0], type: 'redstone_wire' },
    { pos: [2, 1, 0], type: 'redstone_wire' },
    { pos: [3, 1, 0], type: 'redstone_lamp' },
  ] });
  const out = await call('step', {
    ticks: 6,
    watch: [{ name: 'lamp', pos: [3, 1, 0] }],
    actions: [{ tick: 2, use: [0, 1, 0] }, { tick: 4, use: [0, 1, 0] }],
  });
  assert.match(out, /t\+2 lamp=true/);
  assert.match(out, /t\+8 lamp=false|game time: 6/);
  const view = await call('view', {});
  assert.match(view, /y=1/);
  const bad = await client.callTool({ name: 'place', arguments: { blocks: [{ pos: [9, 5, 9], type: 'redstone_wire' }] } });
  assert.equal((bad as any).isError, true);
  await client.close();
});


test('MCP server: learnings, add_learning, list_designs, build_design', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cs-'));
  const file = join(dir, 'LEARNINGS.md');
  copyFileSync('knowledge/LEARNINGS.md', file);
  const client = new Client({ name: 't', version: '0' });
  await client.connect(new StdioClientTransport({ command: 'npx', args: ['tsx', 'src/mcp.ts'], env: { ...process.env as Record<string, string>, CLAUDESTONE_LEARNINGS_FILE: file } }));
  const call = async (name: string, args: any) =>
    ((await client.callTool({ name, arguments: args })) as any).content[0].text as string;

  assert.match(await call('learnings', {}), /what we have learned/);
  assert.match(await call('learnings', { section: 'Glue' }), /obsidian/);
  await call('add_learning', { category: 'test', text: 'hello from the test' });
  assert.match(readFileSync(file, 'utf8'), /\*\*test\*\*: hello from the test/);

  const designs = JSON.parse(await call('list_designs', {}));
  assert.ok(designs.some((d: any) => d.name === 'piston-door-3x3'));
  assert.ok(designs.find((d: any) => d.name === 'double-piston-extender-vertical').realGameVerified);

  const built = JSON.parse(await call('build_design', { name: 'double-piston-extender-vertical', origin: [50, 0, 50] }));
  assert.deepEqual(built.lever, [50, 0, 55]);
  const tip = JSON.parse(await call('read', { pos: [50, 2, 50] }));
  assert.equal(tip.type, 'stone');
  await call('use', { pos: built.lever });
  await call('step', { ticks: 40 });
  assert.equal(JSON.parse(await call('read', { pos: [50, 4, 50] })).type, 'stone');
  await client.close();
});
