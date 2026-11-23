# Micro test 2: quasi connectivity (BUD) in your game version

Three copies: A (x=0), B (x=8), C (x=16). Each has a plain piston facing EAST at the bottom with nothing in front of it.

1. Copies B has a lever on the side of its top stone: flip it ON. (A and C need nothing: their redstone block is already in place.)
2. Check: nothing extended yet.
3. Now give each piston a block update: place any block against its WEST side and break it again.
4. Which pistons extended?

| copy | setup | simulator says |
|---|---|---|
| A | air above the piston, redstone block on top of that air cell | extends |
| B | stone, stone above it, lever on the side of the top stone | extends |
| D (x=24) | air above the piston, a dust line beside that air cell (north side), lever on a stone feeds the dust (flip it) | sim: extends right away (dust updates the piston) |
| C | stone, stone above it, only a redstone block on top of the top stone | does NOT extend |

If your game disagrees with any row, tell me which: that is a quasi-connectivity rule I have wrong.
