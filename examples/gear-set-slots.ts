/** Lists the crafters of the gear set machine with the slots that must stay ENABLED (schematics do not carry the slot toggles). */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { buildGearSet } from './gear-set.ts';

const w = new World();
buildGearSet(w);
const rows = w.listBlocks().filter((b) => b.type === 'crafter').sort((a, b) => a.pos[2] - b.pos[2] || a.pos[0] - b.pos[0]).map((b) => {
  const off = w.disabledSlots(b.pos);
  const on = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => !off.includes(i));
  return `| ${b.pos.join(', ')} | ${b.props?.facing} | ${on.map((i) => i + 1).join(', ')} |`;
});
const md = `# Gear set machine: crafter slot toggles

A pasted schematic does not carry the disabled crafter slots. In the game, open each crafter and click the slots NOT listed to disable them (slot 1 = top left, 9 = bottom right, row by row).

| crafter (x, y, z) | faces | keep these slots enabled |
| --- | --- | --- |
${rows.join('\n')}
`;
writeFileSync('knowledge/gear-set-crafter-slots.md', md);
console.log(md);
