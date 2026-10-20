import { readFileSync } from 'node:fs';
import { simulate, type Spec } from './sim.ts';

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx src/cli.ts <build.json>');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(file, 'utf8')) as Spec;
const r = simulate(spec);
console.log(r.timeline.join('\n'));
if (r.failures.length) {
  console.log('\nFAILED:\n' + r.failures.join('\n'));
  process.exit(1);
}
if (spec.expect?.length) console.log(`\nall ${spec.expect.length} expectations passed`);
