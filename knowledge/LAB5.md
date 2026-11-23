# Lab 5: water (item lifts)

`examples/lab5.ts` -> `examples/lab5.schem` (66 x 10 x 13, 5 cells) + `examples/lab5-cells.txt` (probes, the simulator's per-tick events AND the simulator's item positions per tick).
A dropper next to L0 fires ONE item into a water column when the lever goes ON.
Cells: `W.plain` (6 high water source column on obsidian), `W.plain.soul` (the same on soul sand, plain water: lab 1 showed it does not become a bubble column),
`W.bubble` (real `bubble_column` blocks on soul sand, open top: does the item get launched above the top?), `W.liftTop` (the gear set's lift top: bubble column, lid, flowing spill cell, hopper, chest),
`W.flow` (item thrown on a short stream of flowing water).

## Procedure
1. Paste `lab5.schem`. P = its minimum corner; the lever is at P + (3,4,4). Keep P .. P+(65,17,12) free: items may be launched up to ~12 blocks (the bubble column has an open top).
2. `/gearrec full <P> <P+65,17,12>` (current tools/gearrec.sc: it logs every item entity every tick: `I id x y z v vx vy vz item xN age`).
3. `/tick freeze`, right-click the lever, `/tick step 150` and WAIT until it finishes, right-click again, `/tick step 100`, wait. (The first phase is longer: the item needs time.)
4. `/gearrec stop`, `/tick unfreeze`. Send `rec.txt` and P.
Compare: `LAB=lab5 npx tsx tools/labtrace.ts compare rec.txt <lever x,y,z>` prints the block events (water levels, hopper/chest contents) and a per-cell table of the item height (and x) every 4 ticks, sim vs real.

## What it settles
Item speed in plain water vs a bubble column, whether the item is launched out of an open bubble column top, whether plain water on soul sand lifts at all, whether the lid + spill cell + hopper
at the top of the lift works (time from drop to chest), and how fast flowing water carries an item. Note: the dropper's random throw velocity differs per run, so item tracks agree only statistically.
