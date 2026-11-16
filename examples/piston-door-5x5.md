# 5x5 piston door (slime / honey)

**Simulated only (Java 1.20 rules). Not tested in the real game.** Same scheme as the 6x6 you confirmed.

- Doorway: x=0..4, y=1..5, walk through along z (door plane z=0).
- 3 bands (y=1-2, y=3-4, y=5). Each band: a LEFT pack (2 wide) slides 2 blocks left (double extender), a RIGHT pack (3 wide) slides 3 blocks right (triple extender). Door blocks are the glue (honey/slime alternate per band).
- Lever OFF = closed, ON = open. Lever + torch inverter at the far north end of the left side.
- Keep the doorway and 4 blocks either side (z=0) clear. Footprint about 51 x 8 x 40. Schematic: `piston-door-5x5.schem`.
