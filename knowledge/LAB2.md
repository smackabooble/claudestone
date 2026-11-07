# Lab 2: timing (tick by tick) and the leaves puzzle

`examples/lab2.ts` -> `examples/lab2.schem` (66 x 6 x 40, 24 cells) + `examples/lab2-cells.txt` (probes and the simulator's events). Same grid as lab 1 (one lever, stub repeaters).
Cells: 8 **leaves** cases (sticky/plain piston, persistent or not, distance 7, log next to it, two leaves in a row, stone as control) and 16 **timing** cells (plain/sticky piston,
repeater delay 1-4, repeater lock, torch, observer, comparator on dust and on a chest, hopper lock, dropper into hopper, sand pushed up / pulled / pushed sideways).

## Procedure (real game; needs the updated tools/gearrec.sc)
1. Paste `lab2.schem` in a flat empty area. P = minimum corner. The lever is at P + (3,4,4). Clear P .. P+(65,5,39).
2. `/script load gearrec` (the new version has `/gearrec full`).
3. `/gearrec full <P> <P+65,5,39>`   (every cell of the box is checked every tick: the game will run slowly while recording, that is fine)
4. `/tick freeze`, then right-click the lever (ON), then `/tick step 100` and wait until it has finished.
5. `/tick freeze` is still on: right-click the lever again (OFF), `/tick step 100`, wait.
6. `/gearrec stop`, `/tick unfreeze`.
7. Send `<world>/scripts/gearrec.data/rec.txt` and P (or the lever's world coordinates).
Compare: `npx tsx tools/labtrace.ts compare rec.txt <lever x,y,z>` prints every probe whose events (state + tick relative to the flick) differ from the simulator.

## Open questions this run answers
- Why do leaves pushed by a sticky piston vanish (lab 1)? Cases L.* differ in piston type, persistent, distance, neighbours.
- Real piston extension / retraction ticks, repeater delays and locking, torch / observer / comparator delays, hopper lock / transfer rhythm (8 gt), dropper delay,
  how long sand takes to fall and whether a piston head stops it.
