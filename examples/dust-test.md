# Dust shape test

File: `dust-test.schem` (Sponge v2, 1.20.1, 34 x 3 x 8). Stone floor, redstone dust on top, left to right:

| # | What | Blocks | Should look like |
|---|------|--------|------------------|
| 1 | straight line | 3 dust | straight line (shape 3 in the picture) |
| 2 | **corner** | 3 dust in an L | the middle piece is a corner (shape 4); the two end pieces are straight stubs |
| 3 | T | 4 dust | T (shape 5) at the junction |
| 4 | cross | 5 dust | cross (shape 6) at the middle |
| 5 | lone dust | 1 dust | cross (shape 6), as placed in Java |
| 6 | lone dust, right-clicked | 1 dust | dot (shape 1) |
| 7 | stair step | 1 dust + 1 dust one block higher | dust climbing the side of the block |

Please open it in the viewer and tell me what piece **2, the corner** looks like (which of the 6 shapes).
If the viewer lets you click a block and shows its properties (shulkr's .schem viewer does), click the middle
piece of group 2: it should read `north=side, west=side, east=none, south=none`.

Exact states in the file:
- group 2 corner (middle piece): `redstone_wire[east=none,north=side,power=0,south=none,west=side]`
- group 3 junction: `redstone_wire[east=side,north=side,power=0,south=none,west=side]`
