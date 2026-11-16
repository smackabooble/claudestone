# Upright double piston extender

File: `double-piston-extender-vertical.schem` (Sponge v2, Minecraft 1.20.1, 5 wide x 4 tall x 8 deep).
Load with WorldEdit (`//schem load double-piston-extender-vertical` then `//paste`) or Litematica.

## What it does
The same two-stage extender as the flat one, standing up:

    A (y=0, sticky, facing up)   B (y=1, sticky, facing up)   X (y=2, tip block)
    lever ON -> X rises to y=4 (2 blocks farther than one piston).   lever OFF -> X comes back down to y=2.

Simulator timing: about 10 game ticks up, about 22 ticks down.

## What changed from the flat version
Dust cannot run up a wall, so the power taps were redesigned:
- **A (y=0):** a repeater south of it points into it. It is fed by an OR of a fast path (instant on) and a slow
  path (late off): two parallel paths into one dust node.
- **B at the top of its travel (y=2):** a repeater east of it points into it, fed through a delay repeater and a
  small 2-step dust staircase that climbs from the y=0 bus up to y=2.
- **B at home (y=1):** a repeater west of it points into it. An observer that watches A feeds it a pulse when A has
  come home. That pulse is the last pull that brings the tip all the way down.
- The slow path is now two repeaters in a row (3 + 3 repeater ticks). With a single repeater the working timing
  window was zero wide; with two it works across a range of delays, so it should survive small timing differences.

## Why the timing matters
- B must not extend before A has pushed it (an extended piston cannot be pushed).
- A must not retract before B has finished retracting (a moving piston cannot be pulled).
- A sticky piston only pulls the block directly in front of its head, so the observer pulse is needed for the last block.

## After pasting
Flick the lever on and off once if anything looks off; pasting does not always trigger redstone updates.

## Layers
Printed from the simulator, x -2..2 across, z -2..5 down, one grid per height from y=-1 (floor) to y=2.
`S` sticky piston, `o` observer, `#` stone, `0`-`f` dust power, `< > ^ v` repeaters (point at their output), `l` lever.
Retracted rest state. The arm is the column at x=0, z=0.
```
y=-1  (x -2..2 →, z -2..5 ↓)
.....
.....
.....
..#..
..###
..#.#
..#.#
..###

y=0  (x -2..2 →, z -2..5 ↓)
###..
#.o..
##S..
..^.#
..0<0
..^.0
..^.0
..l00

y=1  (x -2..2 →, z -2..5 ↓)
000..
0....
0>S##
....0
.....
.....
.....
.....

y=2  (x -2..2 →, z -2..5 ↓)
.....
.....
..#<0
.....
.....
.....
.....
.....
```
(The tip block stands at y=2 in column x=0, z=0; the layers above stop at y=2.)

## Honest limits
Built and tested in my simulator only (Java 1.20 rules written from memory, cross-checked against MCHPRS and wiki
summaries). The flat version worked for you in the real game, which is a good sign for the shared logic, but this
upright layout has different wiring and has not been tried in the real game. If it jams, tell me what the pistons do
and I will adjust the delays. See `ACCURACY.md`.

Rebuild or change it: `npx tsx examples/double-piston-extender-vertical.ts`

## Revision note
The first version of this file had stale dust connections on the dust staircase (dust pointing sideways where real Minecraft would connect it up or down the step). That is a state that cannot occur in regular Minecraft. The simulator now applies the same indirect shape updates as the game, and a test checks every dust block against what a fresh placement would give. Re-download this file.
