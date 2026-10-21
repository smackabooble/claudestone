# 10x10 piston door (slime / honey)

**Simulated only (Java 1.20 rules). Not tested in the real game.** Needs your testing; expect small timing fixes.

- Doorway: x=0..9, y=1..10. Door planes z=0 (big units) and z=1 (two edge columns).
- 5 bands (2 tall). Per band: LEFT unit x=1..4 and RIGHT unit x=5..8 (4x2 = 8 blocks each), pulled 5 blocks out by quint extenders (5 sticky pistons, 10 modules in total). 4 pistons + 8 blocks = 12, the push limit exactly.
- Edge columns x=0 and x=9: one 1x2 piece per band, moved 1 block (z=1 <-> z=2) by a plain sticky piston at z=3. They sit one plane behind so the big units slide past x=0 without hitting them.
- Lever OFF = closed, ON = open. Lever + torch inverter at the far north end of the left side.
- Open: planes z=0 and z=1 are clear. The edge pieces (z=2) and their power lines (x=0 and x=9, z=3..36) stay standing south of the door, so keep that strip free.
- Footprint 105 x 12 x 97. Schematic: `piston-door-10x10.schem`. In the sim: open in about 170 ticks, closed in about 90 (full reset a few hundred).
