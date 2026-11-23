/**
 * XNOR GATE = the user's torch XOR (knowledge/refs/xor-user.litematic) + one inverter at the output. The XOR's lamp is replaced by a wool block (4,4,3) powered by the
 * XOR's last dust; a wall torch on its west face (3,4,3) is lit only while that block is unpowered (= A xnor B), and it powers the lamp above it (3,5,3).
 * Levers: A (10,3,2), B (10,3,4). Simulated only, not checked in the real game.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { World } from '../src/world.ts';
import { exportSchem } from '../src/export.ts';
import { loadSchematic } from '../src/schematic.ts';

export function buildXnor(w: World): { a: [number, number, number]; b: [number, number, number]; lamp: [number, number, number] } {
  const s = loadSchematic(readFileSync(new URL('../knowledge/refs/xor-user.litematic', import.meta.url)));
  for (const bl of s.blocks as any[]) {
    if (bl.type === 'glass') continue;                          // size markers of the litematic
    if (bl.type === 'redstone_lamp') continue;                  // replaced below
    const p = { ...(bl.props ?? {}) }; if (bl.type === 'lever') p.powered = false;
    w.setRaw(bl.pos, bl.type, p);
  }
  w.setRaw([4, 4, 3], 'orange_wool');                           // block powered by the XOR output dust
  w.setRaw([3, 4, 3], 'redstone_wall_torch', { facing: 'west', lit: true });
  w.setRaw([3, 5, 3], 'redstone_lamp', { lit: true });                  // rest state (A=B=0): torch lit, lamp lit
  return { a: [10, 3, 2], b: [10, 3, 4], lamp: [3, 5, 3] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new World(); buildXnor(w); w.run(30);
  writeFileSync('examples/xnor-gate.schem', exportSchem(w).buffer);
}
