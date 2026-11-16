# 8x8 piston door (slime / honey)

**Simulated only (Java 1.20 rules). Not tested in the real game.** Same scheme as the 6x6 that you confirmed.

- Doorway: x=0..7, y=1..8, walk through along z (door plane z=0).
- 4 rows. Each row: a LEFT unit (2 quads, 8 blocks) slides 4 blocks left, a RIGHT unit slides 4 blocks right.
  Door blocks are the glue; slime/honey alternate per row and between the two units.
- 8 quad extenders (4 per side) stacked every 2 blocks in y in the side walls.
- Lever OFF = closed, ON = open. Lever + torch inverter at the far north end of the left side.
- Keep the doorway and 5 blocks either side (z=0) clear. Footprint about 73 x 10 x 66. Schematic: `piston-door-8x8.schem`.
