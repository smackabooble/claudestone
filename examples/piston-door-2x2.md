# 2x2 sticky-piston door

File: `piston-door-2x2.schem` (Sponge v2, Minecraft 1.20.1 / DataVersion 3465, 8 wide x 9 tall x 3 deep).
Load with WorldEdit (`//schem load piston-door-2x2` then `//paste`) or Litematica.

## How it works
- The doorway is 2 wide x 2 high in a stone wall (the z=0 plane); you walk through along z.
- 4 sticky pistons: two below the doorway (facing up) and two above it (facing down). Each pulls one door block
  out of the doorway into the wall cell next to it. Extended = closed, retracted = open.
- **Lever ON = open, OFF = closed.** A redstone torch keeps the pistons powered; the lever powers the torch's
  support block and turns the torch off.
- Dust runs along behind the wall (z=1) for the lower and upper pistons, joined by a small dust staircase on the east side.
- Timing in the simulator: opens 2 game ticks after the lever, closes about 4 ticks after.

## After pasting
The file contains the settled closed state (extended pistons with heads). If the door looks stuck after paste,
flick the lever on and off once; pasting does not always trigger redstone updates.

## Layers (x -2..5 across, z 0..2 down; legend: # stone, S sticky piston, = piston head, 0-f dust power,
t/T torch off/on, l/L lever off/on, ^v<> repeater). Printed in the closed state.
```
y=-2  (x -2..5 →, z 0..2 ↓)
######..
........
........

y=-1  (x -2..5 →, z 0..2 ↓)
##SS##..
..###...
........

y=0  (x -2..5 →, z 0..2 ↓)
##==##..
..bcd...
....#...

y=1  (x -2..5 →, z 0..2 ↓)
######..
........
....e#..

y=2  (x -2..5 →, z 0..2 ↓)
######..
.....#..
.....fT#

y=3  (x -2..5 →, z 0..2 ↓)
##==##..
....#e..
.......l

y=4  (x -2..5 →, z 0..2 ↓)
##SS##..
..##d...
........

y=5  (x -2..5 →, z 0..2 ↓)
######..
..bc....
........

y=6  (x -2..5 →, z 0..2 ↓)
######..
........
........
```

## Things the simulator taught me (worth knowing)
- Dust on TOP of a piston pops off when that piston retracts (its base turns into a moving-piston block for 2 ticks),
  so the power lines sit behind the pistons on stone blocks, not on the pistons.
- A piston ignores power from the block it faces.
- Pistons can be powered diagonally from above ("quasi-connectivity"), but only after a block update next to them.
- A lone piece of dust is a "cross" and powers all four sides; right-click makes it a dot.

## Honesty about accuracy
Everything was built and tested in a simulator written from memory of Java 1.20 rules, cross-checked against
MCHPRS and wiki summaries. It has not been run in the real game. See `ACCURACY.md`. If the door misbehaves in
Minecraft, the likely suspects are piston timing and whether dust survives next to moving pistons.

## Rebuild or change it
`npx tsx examples/piston-door-2x2.ts` rebuilds the door, tests open/close, and rewrites the .schem.

## Revision note
The first version of this file had stale dust connections on the dust staircase (dust pointing sideways where real Minecraft would connect it up or down the step). That is a state that cannot occur in regular Minecraft. The simulator now applies the same indirect shape updates as the game, and a test checks every dust block against what a fresh placement would give. Re-download this file.
