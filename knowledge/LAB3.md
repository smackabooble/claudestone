# Lab 3: observers, comparator levels, hopper chains, push limit, update order, destroy list

`examples/lab3.ts` -> `examples/lab3.schem` (66 x 18 x 40, 21 cells) + `examples/lab3-cells.txt` (probes + the simulator's events).
Cells: observer chain / observer watching a piston head / watching dust / an observer pushed by a piston; comparator levels (9 swords moved one by one into a dropper: dust power = signal);
hopper chain (torch-locked hopper -> hopper -> hopper -> chest); the 12-block push limit (column of 12 and of 13 stone); two pistons pushing one stone in the same tick;
what a piston head destroys (dust, repeater, comparator, torch, lever, button, pressure plate; lamp and note block as controls); a piston pushing a retracted piston; sand dragged by slime.

## Procedure (same as lab 2)
1. Paste `lab3.schem`. P = its minimum corner; the lever is at P + (3,4,4). Clear P .. P+(65,18,39) (the push-limit columns are tall).
2. `/script load gearrec` (use the current tools/gearrec.sc).
3. `/gearrec full <P> <P+65,18,39>`
4. `/tick freeze`, right-click the lever, `/tick step 100`, wait; right-click the lever again, `/tick step 100`, wait.
5. `/gearrec stop`, `/tick unfreeze`. Send `scripts/gearrec.data/rec.txt` and P.
Compare: `LAB=lab3 npx tsx tools/labtrace.ts compare rec.txt <lever x,y,z>` (the initial states are compared too).

## What it settles
Observer pulse timing and chains; comparator signal strength per number of items; hopper hop time (8 gt) along a chain; whether 13 blocks really cannot be pushed;
which piston wins when two push one block; which components a piston head destroys (matters for compact builds: what may sit in front of a piston); pistons pushing pistons.
