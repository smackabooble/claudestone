# 10x10 piston door (slime / honey)

**Simulated only (Java 1.20 rules). Not tested in the real game.** Needs your testing; expect small timing fixes.

- Doorway: x=0..9, y=1..10, one flush plane z=0.
- 5 bands (2 tall). Per band: LEFT unit x=1..4 and RIGHT unit x=5..8 (4x2 = 8 blocks each), pulled 5 blocks out by quint extenders (10 modules). 4 pistons + 8 blocks = 12, the push limit exactly.
- Edge columns x=0 and x=9: when closed the arm's piston head fills the lower cell of each band and a 1-block slime/honey piece fills the upper cell. A plain sticky piston moves that piece 1 block (z=0 <-> z=1).
- The units slide through x=0 and x=9, so a torch gate makes the edge pieces close late and open early.
- Lever OFF = closed, ON = open. Lever + torch inverter at the far north end of the left side.
- Open: the door plane is clear. Edge pieces (z=1) and their power lines stay in columns x=0 and x=9 south of the door, keep that strip free.
- Footprint 105 x 12 x 97. Schematic: `piston-door-10x10.schem`.
- In the sim: open in about 190 ticks, closed in about 220. Wait a few seconds between toggles.
