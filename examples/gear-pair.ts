/** One diamond "pair": a block crafter filling a shared stash that feeds two gear crafters (Y, X). Sim-tested in test/gear-pair.test.ts. */
import { Board, route, assignRepeaters, conveyor } from './noglue-lib.ts';
import { buildFeedPair, buildCrafterMod, buildDirectKit } from './gear-parts.ts';
import { buildTimeline, KITS } from './gear-kit.ts';
import type { Pos } from '../src/dirs.ts';

export interface PairSpec { yName: string; xName: string }
export interface PairPins {
  startC1: Pos; startY: Pos; startX: Pos;
  blockBus: Pos;                 // tap bus cell of the block crafter (a chest / hopper line with diamond blocks goes here)
  outY: Pos; outX: Pos;          // collector hopper of each gear crafter (facing east)
  stash: Pos;
}

export function buildPair(b: Board, O: Pos, name: string, spec: PairSpec): PairPins {
  const yk = KITS[spec.yName], xk = KITS[spec.xName];
  const fp = buildFeedPair(b, [O[0], O[1] + 1, O[2]], `${name}.fp`);                         // stash chests at O.y+2
  const c1 = buildDirectKit(b, [O[0], O[1] + 3, O[2]], `${name}.c1`, [4], 'down');           // block crafter above the stash, facing down into it
  const my = buildCrafterMod(b, [O[0] - 24, O[1], O[2] + 16], `${name}.y`, yk);
  const mx = buildCrafterMod(b, [O[0] + 24, O[1], O[2] + 16], `${name}.x`, xk);
  conveyor(b, fp.outY, my.inD, `${name}.cy`);
  conveyor(b, fp.outX, mx.inD, `${name}.cx`);
  // timelines (north of everything)
  const tc1 = buildTimeline(b, [O[0] - 8, O[1] + 3, O[2] - 40], `${name}.tc1`, 1, 0);
  const ty = buildTimeline(b, [O[0] - 40, O[1], O[2] - 10], `${name}.ty`, yk.diamonds, 0);
  const tx = buildTimeline(b, [O[0] + 40, O[1], O[2] - 10], `${name}.tx`, xk.diamonds, 0);
  b.floorColor = 'orange';
  const links: { path: Pos[]; net: string }[] = [];
  const link = (from: Pos, to: Pos, net: string, own: string[]) => links.push({ path: route(b, from, to, net, { own, strict: true }), net });
  link(tc1.PD!, c1.PD, `${name}.tc1.tl.PD`, [`${name}.c1.pd`]);
  link(tc1.PC, c1.PC, `${name}.tc1.tl.PC`, [`${name}.c1.pc`]);
  link(ty.PD!, fp.pulseY, `${name}.ty.tl.PD`, [`${name}.fp.py`]);
  link(ty.PC, my.pulseC, `${name}.ty.tl.PC`, [`${name}.y.pc`]);
  link(tx.PD!, fp.pulseX, `${name}.tx.tl.PD`, [`${name}.fp.px`]);
  link(tx.PC, mx.pulseC, `${name}.tx.tl.PC`, [`${name}.x.pc`]);
  for (const l of links) assignRepeaters(b, l.path, l.net, undefined, 5);
  return { startC1: tc1.start, startY: ty.start, startX: tx.start, blockBus: c1.busA, outY: my.out, outX: mx.out, stash: fp.chestL };
}
