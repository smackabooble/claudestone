import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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
