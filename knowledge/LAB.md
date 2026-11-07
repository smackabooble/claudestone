# The lab: testing the simulator against the real game

`examples/lab.ts` builds 193 small independent cells (conduction, dust support, piston push/pull, slime glue, quasi-connectivity), all fed by ONE lever.
Files: `examples/lab.schem` (paste with Litematica), `examples/lab-cells.txt` (cells, probes, the simulator's answers), `tools/labsnap.sc` (Carpet app that writes block snapshots),
`tools/labcheck.ts` (prints / compares). Size 136 x 6 x 112 (a 2-D grid of cells, 17 per row; only 6 blocks high). In schematic coordinates the lever is at (3,4,4).

## Procedure (real game)
1. Paste `lab.schem` somewhere flat and empty (let P = its minimum corner; the lab needs P .. P+(135,5,111) clear). Lever world position = P + (3,4,4). Stand in the middle while it runs: the lab is about 9 x 7 chunks, all of them must be loaded and ticking (simulation distance 6 or more).
2. Put `tools/labsnap.sc` in `<world>/scripts/`, `/script load labsnap`.
3. `/labsnap <P> <P+135,5,111> before`   (a few seconds of lag)
4. Flick the lever ON, wait 10 s, `/labsnap <P> <P+135,5,111> on`
5. Flick the lever OFF, wait 10 s, `/labsnap <P> <P+135,5,111> off`
6. Send `scripts/labsnap.data/before.txt`, `on.txt`, `off.txt` and the lever's world coordinates.
Compare: `npx tsx tools/labcheck.ts compare before.txt on.txt off.txt <lever x,y,z>` lists every cell where the simulator and the real game differ (groups summarised).

## Design rules of the cells
- Every cell k: stub repeater at (x,1,z+1) flows south into the cell origin L0, a conductor block that is STRONGLY powered while the lever is ON.
- Blocks are pasted without updates (like a real paste): initial block states are explicit (lamp lit=false, piston extended=false, ...).
- Falling blocks (sand, gravel) get obsidian under them, else the test block just falls away.
- Quasi-connectivity cells come as `.kick` (a note block next to the piston and the powered block toggles, so a block update reaches the piston) and `.nokick` (pure BUD, nothing updates the piston). A piston is only re-checked when an adjacent block updates; lamps change state with flag 2 and do not update neighbours, note blocks do (flag 3).
- Slime/honey/lever/etc. details that the lab will settle: whether slime conducts (the sim says yes), honey (no), which blocks can be pushed, which blocks dust can stand on, QC offsets per block type.

## Next
Per-tick timing cells (observer chains, repeater locking, comparator modes, hopper / dropper timing, falling-block timing with pistons), then a Carpet recorder that logs only the probe cells every tick.
