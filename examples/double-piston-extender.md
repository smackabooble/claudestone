# Double piston extender (DPE)

File: `double-piston-extender.schem` (Sponge v2, Minecraft 1.20.1, 6 wide x 2 tall x 7 deep).
Load with WorldEdit (`//schem load double-piston-extender` then `//paste`) or Litematica.

## What it does
Two sticky pistons in a row, facing east, plus a tip block:

    A (x=0)   B (x=1)   X (x=2)  ->  lever ON  ->  X ends up at x=4 (2 blocks farther than one piston reaches)

- **Lever ON:** A extends and pushes B forward one block; B then extends and pushes X one more block.
- **Lever OFF:** B retracts and pulls X back one block; A retracts and pulls B home; an observer then sees A arrive
  and pulses B once more (extend + retract), which pulls X the last block home.
- Simulator timing: about 7 game ticks out, about 14 ticks back.

## Why it needs a circuit (the hard part)
- B must not extend before A has pushed it (an extended piston cannot be pushed).
- A must not retract before B has finished retracting and landed (a piston still moving cannot be pulled), and
  B must be retracted (not extended) when A pulls it.
- A sticky piston can only pull the block directly in front of its head, so X needs B's extra pulse at the end.

How the circuit does it:
- **A: instant on, late off.** Two repeaters (delay 1 and delay 4) feed one dust node (J). J turns on with the fast
  path and off only after the slow path drops (8 game ticks).
- **B: late on, early off.** One repeater (delay 2, 4 game ticks) feeds B's power line.
- **Observer** watches A and pulses B's line when A comes home. This pulse is the last pull of X.
- Power lines sit on stone behind the arm; bus wires next to the arm sit on **glass** so the stone beside B is
  not powered by accident.

## After pasting
Flick the lever on and off once if anything looks off; pasting does not always trigger redstone updates.

## Layers
Printed from the simulator (x 0..5 across, z -2..4 down). `S` sticky piston, `o` observer, `#` stone, `g` glass,
`0`-`f` dust power, `< > ^ v` repeaters (point at their output), `l` lever. Rest state (retracted):
```
y=0  (x 0..5 →, z -2..4 ↓)
##....
o#####
SS#..#
#ggggg
#.#...
###...
#.....

y=1  (x 0..5 →, z -2..4 ↓)
00....
.00<00
.....0
0<0000
^.0...
000...
l.....
```

## Honest limits
Built and tested only in my simulator (Java 1.20 rules written from memory, cross-checked against MCHPRS and wiki
summaries); it has not been run in real Minecraft. The timing margins are about 2 game ticks, so if it jams in
the real game the likely cause is piston timing differing from the simulator. The fix is a different repeater
delay: raise the slow path or lower B's delay by one step. See `ACCURACY.md`.

Rebuild or change it: `npx tsx examples/double-piston-extender.ts` (edit the delays in `DEFAULT_DELAYS`).
