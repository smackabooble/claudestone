# HIDDEN LIFT (user goal, long research project)

Spec (knowledge/refs/hidden-lift-before/after.litematic): a row of 8 iron blocks (1x1x8, along z). ON: the block at z=3 floats at y=4, cells y=0..3 are AIR, the other 7 stay.
OFF: flat row again. In BOTH rest states nothing but the iron blocks is visible: every piston, dust, torch, repeater, observer, support is under the row (y<0).
What happens while it moves does not matter. Colour convention applies to everything hidden (wool), no floors.

## Why it is hard (analysis, not yet tested)
- A piston moves a block 1 cell, and hidden pistons (y<=-1) only reach y=0. To lift the block 4 cells, piston bodies must travel up into y=0..3 and later sink back (telescoping arm).
- A piston that has been lifted needs power from something next to it at that height; that something must also end up hidden. Redstone beside the shaft at y>=0 is visible, so the power has to ride inside the shaft (carried redstone blocks, observers, torches) or come from QC tricks.
- Leaving the block floating: the top sticky piston must DROP it (short pulse <= 2 gt: no pull) and retract. Block stays (iron does not fall).
- Bringing it back down: only a sticky piston can pull, 1 cell per stroke (head extends into the free cell, retracts and pulls the block that is 2 away); the arm needs 4 such strokes with the body descending between them (the repo's gap-closing runs do exactly this for the load of an extender).

## Learning stages (each gets a sim test + a LEARNINGS entry, user can send schematics)
1. Drop: a sticky piston pushes a block 1 up, retracts on a 2 gt pulse, block stays; on a 4 gt pulse it comes back. (sim rule exists, verify in a test)
2. Two-stage lift that leaves the block floating 2 up, arm hidden.
3. POWER OF LIFTED PISTONS (the key problem): find a way that a piston standing at y>=0 gets power with nothing visible afterwards. Candidates: redstone block carried in the stack, observer pairs riding the stack, QC from a hidden block, self-triggering observer chains.
4. Pull a floating block down 1..4 cells with the arm; arm ends hidden.
5. Combine to 4 up/down with one lever, test that only the iron blocks are visible at rest (test: scan all cells y>=0 outside the iron row = air).
Good schematics to ask the user for: piston elevators, flying machines that go up and down, hidden/self-hiding mechanisms, anything that powers a moving piston.
