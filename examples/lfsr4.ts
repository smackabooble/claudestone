/**
 * 4-BIT LFSR (x^4+x^3+1, 15 states) on the two-phase pulse clock. One flip of the STEP lever = one step. Taps = Q3 xor Q4 (the user's torch XOR, inputs through repeaters)
 * feed bit 1. A SEED lever next to the feedback line sets a 1 into the register (0000 is the lock-up state). 4 lamps show Q1..Q4.
 * Layout (x east, z north is negative, y=1 data plane): row z=0: bit i = M(6i+1), S(6i+3) (master/slave latches = repeater + side-locking repeater, see ff-bit.ts), north lock bus z=-2
 * (NOT phi1), south lock bus z=2 (NOT phi2), both fed by torches from the clock at x=24..30. The Q taps climb over the north bus on wool stairs to y=3.
 * Simulated and real-checked: see test/lab.test.ts and knowledge/REALMC.md. Colours: row dust yellow, latches orange, locks red, north bus pink, south bus light blue, clock purple/magenta/green/cyan.
 */
import { readFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { loadSchematic } from '../src/schematic.ts';
type P3 = [number, number, number];

export function buildLfsr(w: World) {
  const set = (x: number, y: number, z: number, t: string, p: any = {}) => w.setRaw([x, y, z], t, p);
  const wool = (x: number, y: number, z: number, c: string) => set(x, y, z, c);
  /** a part on top of its own wool support */
  const on = (x: number, y: number, z: number, t: string, p: any = {}, c = 'light_gray_wool') => { wool(x, y - 1, z, c); set(x, y, z, t, p); };
  const dust = (x: number, y: number, z: number, c = 'yellow_wool') => on(x, y, z, 'redstone_wire', {}, c);
  const rep = (x: number, y: number, z: number, facing: string, delay: number, c = 'orange_wool') => on(x, y, z, 'repeater', { facing, delay, powered: false }, c);
  const lever = (x: number, y: number, z: number, c = 'purple_wool') => on(x, y, z, 'lever', { face: 'floor', facing: 'north', powered: false }, c);
  const lamp = (x: number, y: number, z: number) => set(x, y, z, 'redstone_lamp', { lit: false });

  // ---- the register row (z=0) ----
  for (let i = 0; i < 4; i++) {
    const x0 = 6 * i;
    dust(x0, 1, 0); rep(x0 + 1, 1, 0, 'west', 1); dust(x0 + 2, 1, 0); rep(x0 + 3, 1, 0, 'west', 1); dust(x0 + 4, 1, 0); if (i < 3) dust(x0 + 5, 1, 0);
    rep(x0 + 1, 1, -1, 'north', 1, 'red_wool');       // M lock: input from the north bus, output south into M's side
    rep(x0 + 3, 1, 1, 'south', 1, 'red_wool');        // S lock: input from the south bus, output north into S's side
  }
  // ---- lock buses, fed from the east by torches; a refresh repeater in the middle of each ----
  for (let x = 1; x <= 23; x++) { if (x === 12) rep(12, 1, -2, 'east', 1, 'pink_wool'); else dust(x, 1, -2, 'pink_wool'); }
  for (let x = 3; x <= 23; x++) { if (x === 12) rep(12, 1, 2, 'east', 1, 'light_blue_wool'); else dust(x, 1, 2, 'light_blue_wool'); }
  // ---- clock (east): STEP lever (30), observer (29) watches it, B0 (28) gets the 2 gt pulse ----
  lever(30, 1, 0); set(29, 1, 0, 'observer', { facing: 'east', powered: false }); wool(28, 0, 0, 'magenta_wool'); set(28, 1, 0, 'magenta_wool');
  rep(28, 1, -1, 'south', 4, 'green_wool');                                                  // phi1 (input B0, output north)
  for (const x of [28, 27, 26]) dust(x, 1, -2, 'green_wool');                               // ... dust west to B1
  wool(25, 0, -2, 'magenta_wool'); set(25, 1, -2, 'cyan_wool');                              // B1
  set(24, 1, -2, 'redstone_wall_torch', { facing: 'west', lit: true });                       // NOT phi1 -> north bus
  rep(28, 1, 1, 'north', 4, 'green_wool'); rep(28, 1, 2, 'north', 4, 'green_wool'); rep(28, 1, 3, 'north', 4, 'green_wool');   // phi2 = 24 gt later
  for (const x of [28, 27, 26, 25]) dust(x, 1, 4, 'green_wool'); dust(25, 1, 3, 'green_wool');
  wool(25, 0, 2, 'magenta_wool'); set(25, 1, 2, 'cyan_wool');                                // B2
  set(24, 1, 2, 'redstone_wall_torch', { facing: 'west', lit: true });                        // NOT phi2 -> south bus
  // ---- taps: Q_i dust (x0+4,0) climbs over the north bus: wool (x,1,-1), dust (x,2,-1), wool (x,2,-2) [over the bus dust], dust (x,3,-2), then y=3 northwards ----
  const tap = (x: number, zEnd: number) => {
    wool(x, 1, -1, 'light_gray_wool'); set(x, 2, -1, 'redstone_wire'); wool(x, 2, -2, 'light_gray_wool'); set(x, 3, -2, 'redstone_wire');
    for (let z = -3; z >= zEnd; z--) { wool(x, 2, z, 'light_gray_wool'); if (z === -7 && zEnd <= -8) set(x, 3, z, 'repeater', { facing: 'south', delay: 1, powered: false }); else set(x, 3, z, 'redstone_wire'); }   // refresh repeater on the long climbs (input south, output north)
  };
  tap(4, -4); lamp(4, 3, -5);                      // Q1 lamp
  tap(10, -4); lamp(10, 3, -5);                    // Q2 lamp
  tap(16, -8);                                     // Q3 -> XOR input B (z=-8)
  tap(22, -10);                                    // Q4 -> XOR input A (z=-10)
  // lamp spurs for Q3 and Q4: a dust beside the line at z=-4 pointing at a lamp
  wool(17, 2, -4, 'light_gray_wool'); set(17, 3, -4, 'redstone_wire'); lamp(18, 3, -4);
  wool(21, 2, -4, 'light_gray_wool'); set(21, 3, -4, 'redstone_wire'); lamp(20, 3, -4);
  // Q3 line west along z=-8 to x=12, Q4 line west along z=-10 to x=12
  for (let x = 15; x >= 12; x--) { wool(x, 2, -8, 'light_gray_wool'); set(x, 3, -8, 'redstone_wire'); }
  for (let x = 21; x >= 12; x--) { wool(x, 2, -10, 'light_gray_wool'); if (x === 17) set(x, 3, -10, 'repeater', { facing: 'east', delay: 1, powered: false }); else set(x, 3, -10, 'redstone_wire'); }   // repeater refreshes the westward run (input east, output west)
  // ---- the user's torch XOR, shifted by (1,0,-12); levers -> repeaters fed by the two input dusts ----
  const xs = loadSchematic(readFileSync(new URL('../knowledge/refs/xor-user.litematic', import.meta.url)));
  for (const b of xs.blocks as any[]) {
    if (b.type === 'glass' || b.type === 'redstone_lamp' || b.type === 'lever') continue;
    set(b.pos[0] + 1, b.pos[1], b.pos[2] - 12, b.type, { ...(b.props ?? {}) });
  }
  set(11, 3, -10, 'repeater', { facing: 'east', delay: 1, powered: false }); set(11, 3, -8, 'repeater', { facing: 'east', delay: 1, powered: false });
  wool(11, 2, -10, 'orange_wool'); wool(11, 2, -8, 'orange_wool');
  // XOR output dust (6,4,-9) -> west along y=4 (x 5..-1), then down a stair to the row input
  for (let x = 5; x >= -1; x--) { wool(x, 3, -9, 'light_gray_wool'); if (x === 2) set(x, 4, -9, 'repeater', { facing: 'east', delay: 1, powered: false }); else set(x, 4, -9, 'redstone_wire'); }   // repeater at x=2 refreshes the long feedback line
  wool(-1, 2, -8, 'light_gray_wool'); set(-1, 3, -8, 'redstone_wire');        // (-1,4,-9) -> (-1,3,-8)
  wool(-1, 1, -7, 'light_gray_wool'); set(-1, 2, -7, 'redstone_wire');
  wool(-1, 0, -6, 'light_gray_wool'); set(-1, 1, -6, 'redstone_wire');
  for (let z = -5; z <= 0; z++) { if (z === -4) rep(-1, 1, -4, 'north', 1, 'green_wool'); else dust(-1, 1, z); }   // feedback line south to the row, refreshed at z=-4 (input north, output south)
  dust(0, 1, 0);                                                              // (already there) feedback arrives from (-1,0)
  lever(-3, 1, -3, 'lime_wool');                                              // SEED: beside the feedback dust (-1,-3)? (-2,-3) dust bridge
  dust(-2, 1, -3);
  return { STEP: [30, 1, 0] as P3, SEED: [-3, 1, -3] as P3, Q: [4, 10, 16, 22].map((x) => [x, 1, 0] as P3), S: [3, 9, 15, 21].map((x) => [x, 1, 0] as P3), M: [1, 7, 13, 19].map((x) => [x, 1, 0] as P3), LAMP: [[4, 3, -5], [10, 3, -5], [18, 3, -4], [20, 3, -4]] as P3[] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { writeFileSync } = await import('node:fs');
  const { exportSchem } = await import('../src/export.ts');
  const w = new World(); buildLfsr(w); w.settleWires(); w.pasteUpdates(); w.run(80);
  writeFileSync('examples/lfsr4.schem', exportSchem(w).buffer);
}
