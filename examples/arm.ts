/**
 * One-sided upright double piston extender ("arm"): every part of the circuit lies at x <= 0 relative to the
 * arm (or x >= 0 when mirrored), so two arms can stand side by side. Same logic as double-piston-extender-vertical.
 *
 * Relative layout (arm along +y at x=0, z=0; tip rests at y=2 and travels to y=4):
 *   A (0,0,0)  B (0,1,0)  observer (0,0,-1) watches A
 *   A drive : J (0,0,2) = OR(fast repeater from the west, slow chain from the south) -> repeater (0,0,1) -> A
 *   B up    : dust staircase (-2,0,3) -> (-1,1,3) -> (0,2,3) -> (0,2,2), delay repeater (0,2,1) -> B at y=2
 *   B home  : observer pulse -> dust at y=1 on the west -> repeater (-1,1,0) -> B at y=1
 *   input   : dust at (0,0,5)  (feed it with a signal; powered = extend)
 */
import type { World } from '../src/world.ts';
import type { Dir, Pos } from '../src/dirs.ts';

export interface ArmDelays { fast: number; slow: number; b: number }
export const ARM_DELAYS: ArmDelays = { fast: 1, slow: 6, b: 4 };

export function buildArm(
  w: World,
  origin: Pos,
  opts: { mirror?: boolean; delays?: ArmDelays; support?: string; skipTip?: boolean } = {},
): { input: Pos; tipRest: Pos } {
  const m = opts.mirror ? -1 : 1;
  const d = opts.delays ?? ARM_DELAYS;
  const sup = opts.support ?? 'obsidian';
  const P = (x: number, y: number, z: number): Pos => [origin[0] + m * x, origin[1] + y, origin[2] + z];
  const flip = (f: Dir): Dir => (opts.mirror ? (f === 'east' ? 'west' : f === 'west' ? 'east' : f) : f);
  const block = (x: number, y: number, z: number) => w.place(P(x, y, z), sup);
  const wire = (x: number, y: number, z: number) => w.place(P(x, y, z), 'redstone_wire');
  const rep = (x: number, y: number, z: number, f: Dir, delay: number) =>
    w.place(P(x, y, z), 'repeater', { facing: flip(f), delay });

  // supports
  for (const [x, z] of [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [-1, 2], [-1, 5], [-2, 5], [-2, 4], [-2, 3], [-2, 2]]) block(x, -1, z);
  block(-1, 0, 3); block(0, 1, 3); block(0, 1, 2); block(0, 1, 1);
  block(-1, 0, 0);
  for (const [x, z] of [[0, -2], [-1, -2], [-2, -2], [-2, -1], [-2, 0]]) block(x, 0, z);

  // the arm
  w.place(P(0, 0, 0), 'sticky_piston', { facing: 'up' });
  w.place(P(0, 1, 0), 'sticky_piston', { facing: 'up' });
  w.place(P(0, 0, -1), 'observer', { facing: 'south' });

  // A drive
  wire(0, 0, 2); rep(0, 0, 1, 'south', 1); rep(-1, 0, 2, 'west', d.fast);
  const s1 = Math.ceil(d.slow / 2), s2 = Math.floor(d.slow / 2);
  rep(0, 0, 4, 'south', s1); rep(0, 0, 3, 'south', s2);
  wire(0, 0, 5); wire(-1, 0, 5); wire(-2, 0, 5); wire(-2, 0, 4); wire(-2, 0, 3); wire(-2, 0, 2);

  // B up
  wire(-1, 1, 3); wire(0, 2, 3); wire(0, 2, 2); rep(0, 2, 1, 'south', d.b);

  // B home pulse
  for (const [x, y, z] of [[0, 1, -2], [-1, 1, -2], [-2, 1, -2], [-2, 1, -1], [-2, 1, 0]]) wire(x, y, z);
  rep(-1, 1, 0, 'west', 1);   // facing = input side: reads the dust at (-2,1,0), outputs east into B

  if (!opts.skipTip) w.place(P(0, 2, 0), 'stone');
  return { input: P(0, 0, 5), tipRest: P(0, 2, 0) };
}
