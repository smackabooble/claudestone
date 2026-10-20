/** Registry of finished, tested designs (built by the scripts in examples/). */
import { World } from './world.ts';
import type { Pos } from './dirs.ts';
import { buildExtender } from '../examples/double-piston-extender.ts';
import { buildUpright } from '../examples/double-piston-extender-vertical.ts';
import { buildFlatArm3 } from '../examples/flat-arm3.ts';
import { buildDoor } from '../examples/piston-door-2x2.ts';
import { buildDoor3 } from '../examples/piston-door-3x3.ts';
import { buildDoor4 } from '../examples/piston-door-4x4.ts';

export interface Design {
  name: string;
  description: string;
  /** true only if the user confirmed it works in the real game */
  realGameVerified: boolean;
  /** ticks to run after building so the build settles into its rest state */
  settle: number;
  /** how to operate it */
  usage: string;
  build: (w: World) => { lever: Pos };
}

export const DESIGNS: Design[] = [
  {
    name: 'double-piston-extender',
    description: 'Flat double piston extender (arm along +x). Tip block travels 2 blocks out and fully back.',
    realGameVerified: true, settle: 40,
    usage: 'lever ON: tip x=2 -> 4 (about 7 ticks); lever OFF: back (about 14 ticks).',
    build: (w) => ({ lever: buildExtender(w).lever }),
  },
  {
    name: 'double-piston-extender-vertical',
    description: 'Upright double piston extender (arm along +y). Tip rises 2 blocks and comes back down.',
    realGameVerified: true, settle: 40,
    usage: 'lever ON: tip y=2 -> 4 (about 10 ticks); lever OFF: back (about 22 ticks).',
    build: (w) => ({ lever: buildUpright(w).lever }),
  },
  {
    name: 'triple-piston-extender',
    description: 'Flat TRIPLE piston extender (arm along +x, 3 sticky pistons + pulse return). Tip travels 3 blocks. About 60x40 footprint (long delay lines).',
    realGameVerified: false, settle: 200,
    usage: 'lever ON: tip x=3 -> 6 (about 60 ticks); lever OFF: back home (about 65 ticks). Lever is at the far north end.',
    build: (w) => ({ lever: buildFlatArm3(w).lever }),
  },
  {
    name: 'piston-door-2x2',
    description: '2x2 sticky piston door: 4 sticky pistons pull the 4 blocks out of the doorway; torch inverter on the lever.',
    realGameVerified: false, settle: 40,
    usage: 'lever ON = open, OFF = closed.',
    build: (w) => ({ lever: buildDoor(w).lever }),
  },
  {
    name: 'piston-door-3x3',
    description: '3x3 piston door: slime-glued side columns, top-centre piston, buried double extender for the lower centre. Obsidian wall.',
    realGameVerified: false, settle: 120,
    usage: 'lever ON = open (about 26 ticks), OFF = closed (about 16). Everything touching slime must stay obsidian.',
    build: (w) => ({ lever: buildDoor3(w).lever }),
  },
  {
    name: 'piston-door-4x4',
    description: '4x4 piston door: four 2x2 quadrants (slime/honey checkerboard), four double extenders. Obsidian wall.',
    realGameVerified: false, settle: 150,
    usage: 'lever ON = open (about 24 ticks), OFF = closed (about 26). Everything touching slime/honey must stay obsidian.',
    build: (w) => ({ lever: buildDoor4(w).lever }),
  },
];

export const findDesign = (name: string): Design | undefined => DESIGNS.find((d) => d.name === name);

/** Build a design in a scratch world, let it settle, and return its blocks (exact states) plus lever position. */
export function materialise(d: Design): { blocks: { pos: Pos; type: string; props: Record<string, any> }[]; lever: Pos } {
  const scratch = new World();
  const { lever } = d.build(scratch);
  scratch.run(d.settle);
  return { blocks: scratch.listBlocks().filter((b) => b.type !== 'moving_piston'), lever };
}
