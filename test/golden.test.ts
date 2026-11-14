import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { simulate } from '../src/sim.ts';

for (const dir of ['examples', 'golden']) {
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    test(`${dir}/${f} meets its expectations`, () => {
      const spec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      assert.ok(spec.expect?.length, 'spec has no expect[]');
      assert.deepEqual(simulate(spec, dir).failures, []);
    });
  }
}
