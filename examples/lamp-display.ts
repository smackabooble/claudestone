/**
 * Lamp 7-segment display with 10 number buttons + CLR. Run: npx tsx examples/lamp-display.ts
 * Press button n: all digit latches are cleared (R bus), then latch n is set (S lane, delayed). One-hot NOR latches
 * (two torches). Each latch drives two torch towers (true / inverted copy) that carry the signal UP to the layers
 * (y) of the 7 segment buses, so no wires cross. Each bus ORs the towers of the digits that use that segment and
 * ends on the screen (lamps under dust). Buttons are in a panel at the west; S lanes form a crossing-free staircase.
 * Screen at x=XS, lamps in plane x=XS: columns z=-2..6, rows y=4 (d) 6 (e,c) 8 (g) 10 (f,b) 12 (a).
 */
import { writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import type { Pos } from '../src/dirs.ts';

const SEGS: Record<string, string> = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
// tower A: true copy (true torches at y=5,9,13), tower B: inverted base (true torches at y=3,7,11,...)
const LAYER: Record<string, { tw: 'A' | 'B'; y: number; side: 1 | -1 }> = {
  d: { tw: 'A', y: 5, side: 1 }, e: { tw: 'B', y: 7, side: -1 }, c: { tw: 'B', y: 7, side: 1 }, g: { tw: 'A', y: 9, side: 1 },
  f: { tw: 'B', y: 11, side: -1 }, b: { tw: 'B', y: 11, side: 1 }, a: { tw: 'A', y: 13, side: 1 },
};
const TZ = 2, STEPX = 8, X0 = 4, XS = X0 + STEPX * 9 + 10, PB = -6, ZR = 8;
const laneZ = (n: number) => -4 - 2 * n;

export interface Lamp7 { buttons: Pos[]; clr: Pos; lamps: Record<string, Pos[]> }

export function buildLampDisplay(w: World): Lamp7 {
  const ox = (n: number) => X0 + STEPX * n;
  for (let x = PB - 6; x <= XS + 1; x++) for (let z = laneZ(9) - 2; z <= ZR + 1; z++) w.place([x, 1, z], 'obsidian');
  const put = (p: Pos, t: string, props?: any) => w.place(p, t, props);
  const buttons: Pos[] = [];
  // ---- R bus: collector (x=PB-1) flows south, then east along z=ZR; repeaters every 12 cells ----
  const colTop = laneZ(9);
  for (let z = colTop; z <= ZR; z++) {
    if (z === ZR) put([PB - 1, 2, z], 'redstone_wire');
    else if ((z - colTop) % 8 === 7 && z % 2 !== 0) put([PB - 1, 2, z], 'repeater', { facing: 'north', delay: 1 });
    else put([PB - 1, 2, z], 'redstone_wire');
  }
  const stubX = new Set<number>(); for (let n = 0; n < 10; n++) stubX.add(ox(n));
  for (let x = PB; x <= ox(9); x++) {
    const rep = (x - PB - 2) % 9 === 0 ? !stubX.has(x) : (x - PB - 3) % 9 === 0 && stubX.has(x - 1);
    if (rep) put([x, 2, ZR], 'repeater', { facing: 'west', delay: 1 });
    else put([x, 2, ZR], 'redstone_wire');
  }
  // ---- CLR button on the collector ----
  put([PB - 3, 2, 6], 'stone'); const clr: Pos = [PB - 2, 2, 6]; put(clr, 'stone_button', { face: 'wall', facing: 'east' });
  for (let n = 0; n < 10; n++) {
    const o = ox(n), zl = laneZ(n);
    // latch: B1 (reset) (o,2,4), T1 (o,2,3) north, Q dust (o,2,2),(o,2,1), B2 (set) (o,2,0), T2 (o+1,2,0) east, return dust x=o+2 z=0..4, (o+1,2,4)
    put([o, 2, 4], 'stone'); put([o, 2, 0], 'stone');
    put([o, 2, 3], 'redstone_wall_torch', { facing: 'north' });
    put([o, 2, 2], 'redstone_wire'); put([o, 2, 1], 'redstone_wire');
    put([o + 1, 2, 0], 'redstone_wall_torch', { facing: 'east' });
    for (let z = 0; z <= 4; z++) put([o + 2, 2, z], 'redstone_wire');
    put([o + 1, 2, 4], 'redstone_wire');
    // R stub (south of B1)
    for (let z = 5; z < ZR; z++) put([o, 2, z], 'redstone_wire');
    // button n in the panel: block X (PB+1), button (PB) faces west, collector dust (PB-1); S lane starts at PB+2
    put([PB + 1, 2, zl], 'stone');
    const btn: Pos = [PB, 2, zl]; put(btn, 'stone_button', { face: 'wall', facing: 'west' }); buttons.push(btn);
    // S path: lane east along z=zl (2 slow repeaters first: S must outlast R), corner at (o,zl), descent south into B2.
    // A repeater (delay 1) whenever 7 cells of dust have gone by on a straight piece.
    const path: { p: Pos; face: string }[] = []; // face = input side of a repeater placed there
    for (let x = PB + 2; x < o; x++) path.push({ p: [x, 2, zl], face: 'west' });
    path.push({ p: [o, 2, zl], face: 'corner' });
    for (let z = zl + 1; z <= -1; z++) path.push({ p: [o, 2, z], face: 'north' });
    let run = 0;
    path.forEach((c, i) => {
      if (i === 0 || i === 2) { put(c.p, 'repeater', { facing: 'west', delay: 4 }); run = 0; return; }
      const straight = c.face !== 'corner' && i > 3 && i < path.length - 1 && path[i + 1].face === c.face;
      if (straight && run >= 7) { put(c.p, 'repeater', { facing: c.face, delay: 1 }); run = 0; }
      else { put(c.p, 'redstone_wire'); run++; }
    });
    // towers: A at o-2 (true copy, fed from Q via dust (o-1,2,2)), B at o+4 (inverted, fed via (o+3,2,2))
    put([o - 1, 2, 2], 'redstone_wire'); put([o + 3, 2, 2], 'redstone_wire');
    const tower = (tx: number, top: number) => {
      for (let y = 2; y <= top; y += 2) put([tx, y, TZ], 'stone');
      for (let y = 3; y <= top; y += 2) put([tx, y, TZ], 'redstone_torch');
    };
    tower(o - 2, 13); tower(o + 4, 11);
    for (const s of SEGS[n]) {
      const L = LAYER[s]; const tx = L.tw === 'A' ? o - 2 : o + 4;
      for (let k = 1; k <= 3; k++) { const z = TZ + L.side * k; put([tx, L.y - 1, z], 'stone'); put([tx, L.y, z], 'redstone_wire'); }
    }
  }
  // ---- segment buses and screen ----
  const lamps: Record<string, Pos[]> = {};
  for (const s of 'abcdefg') {
    const L = LAYER[s]; const zb = TZ + L.side * 4;
    const tees = new Set<number>(); for (let n = 0; n < 10; n++) if (SEGS[n].includes(s)) tees.add(L.tw === 'A' ? ox(n) - 2 : ox(n) + 4);
    let run = 0;
    for (let x = ox(0) - 2; x < XS; x++) {
      put([x, L.y - 1, zb], 'stone');
      if (run >= 8 && !tees.has(x) && x < XS - 1) { put([x, L.y, zb], 'repeater', { facing: 'west', delay: 1 }); run = 0; } // flows east
      else { put([x, L.y, zb], 'redstone_wire'); run++; }
    }
    lamps[s] = [];
    const zs = 'adg'.includes(s) ? [-2, -1, 0, 1, 2, 3, 4, 5, 6] : [zb];
    for (const z of zs) { put([XS, L.y - 1, z], 'redstone_lamp'); put([XS, L.y, z], 'redstone_wire'); lamps[s].push([XS, L.y - 1, z]); }
  }
  return { buttons, clr, lamps };
}

export const LAMP_ON = (w: World, l: Lamp7): string => 'abcdefg'.split('').map((s) => (l.lamps[s].every((p) => w.get(p).p.lit) ? s : '')).join('');

if (process.argv[1]?.endsWith('lamp-display.ts')) {
  const w = new World(); const l = buildLampDisplay(w); w.run(100);
  const press = (p: Pos) => { w.use(p); w.run(120); };
  console.log('initial', LAMP_ON(w, l));
  press(l.clr); console.log('after CLR', LAMP_ON(w, l));
  let bad = 0;
  for (let n = 0; n < 10; n++) { press(l.buttons[n]); const got = LAMP_ON(w, l); const want = 'abcdefg'.split('').filter((s) => SEGS[n].includes(s)).join(''); if (got !== want) bad++; console.log(n, got, got === want ? 'ok' : 'WANT ' + want); }
  console.log(bad ? `FAIL ${bad}` : 'ALL OK');
  // random sequence
  let seq = 0, rbad = 0; let r = 12345; const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff);
  for (let i = 0; i < 40; i++) { const n = rnd() % 10; press(l.buttons[n]); const want = 'abcdefg'.split('').filter((s) => SEGS[n].includes(s)).join(''); seq++; if (LAMP_ON(w, l) !== want) rbad++; }
  console.log(`random presses ${seq}, wrong ${rbad}`);
  const f = new World(); const lf = buildLampDisplay(f); f.run(100); f.use(lf.clr); f.run(120); f.use(lf.buttons[8]); f.run(150);
  const out = exportSchem(f);
  writeFileSync('examples/lamp-display.schem', out.buffer);
  console.log('wrote lamp-display.schem', out.size.join('x'), '(shows 8 until you press a button)');
}
