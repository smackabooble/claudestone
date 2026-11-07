# Lab 4: the lift's gated circuit, hopper clock, crafters, slime chains at the 12-block limit

`examples/lab4.ts` -> `examples/lab4.schem` (66 x 12 x 16, 6 cells) + `examples/lab4-cells.txt`.
Cells: `K.gated` (the user's gated dropper circuit used in all item lifts: a dropper with 4 items under a chest; L0 is next to its comparator so the lever starts it; the sim says
first item at +32 gt then one every 12 gt), `K.hopperclock` (two hoppers + comparator, torch-locked until the lever), `C.crafter.sticks` and `C.crafter.pickaxe` (crafting delay and output),
`S.chain12` / `S.chain13` (a slime column with a stone glued to every slime: 12 blocks move, 13 do not).

## Procedure (same as the other labs)
1. Paste `lab4.schem`. P = its minimum corner. The lever is at P + (3,4,4). Clear P .. P+(65,12,15).
2. `/gearrec full <P> <P+65,12,15>`   (current tools/gearrec.sc)
3. `/tick freeze`, right-click the lever, `/tick step 100` AND WAIT until it has finished (do not flick early), right-click again, `/tick step 100`, wait.
4. `/gearrec stop`, `/tick unfreeze`. Send `rec.txt` and P.
Compare: `LAB=lab4 npx tsx tools/labtrace.ts compare rec.txt <lever x,y,z>`.

## What it settles
The real period of the gated dropper (the lift's throughput), whether the lever's update really starts it, the hopper clock period, crafter delay and what it does with its output,
and whether slime-glued blocks count toward the push limit exactly like pushed blocks.
