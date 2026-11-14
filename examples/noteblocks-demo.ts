import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { buildSong, playSong, type Song } from './noteblocks.ts';

const song: Song = { events: [
  { t: 0, note: 6, inst: 'harp' }, { t: 0, note: 13, inst: 'harp' }, { t: 0, note: 18, inst: 'bass' },
  { t: 3, note: 11, inst: 'bell' }, { t: 6, note: 13, inst: 'harp' }, { t: 10, note: 6, inst: 'basedrum' },
  { t: 10, note: 18, inst: 'harp' }, { t: 40, note: 0, inst: 'chime' },
] };
export function buildDemo(mode: 'comb' | 'dense' = 'comb') {
  const w = new World();
  const built = buildSong(w, song, [0, 10, 0], mode);
  return { w, built };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const { w, built } = buildDemo();
  console.log(playSong(w, built, 100).map((n) => `${n.tick}:${n.instrument}${n.note}`).join(' '));
  const b2 = buildDemo();
  b2.w.run(10);   // settle so dust connections are computed
  const { buffer } = exportSchem(b2.w);
  writeFileSync('examples/noteblocks-demo.schem', buffer);
  console.log('wrote examples/noteblocks-demo.schem, lever at', b2.built.lever);
}
