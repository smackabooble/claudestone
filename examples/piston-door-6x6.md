# 6x6 piston door (slime / honey)

**Confirmed working in the real game by the user** (after being simulated with Java 1.20 rules).

- Doorway: x=0..5, y=1..6, walk through along z (door plane z=0).
- 3 rows. Each row: a LEFT 2x2 quad (slides 2 blocks left) and a RIGHT 2x4 unit (slides 4 blocks right).
  The door blocks themselves are the glue (honey/slime alternate per row so rows never stick together).
- Left: 3 double extenders, right: 3 quad extenders, stacked every 2 blocks in y in the side walls (flat delay-line circuits).
- Lever OFF = closed, ON = open. The lever and torch inverter are at the far north end of the left side.
- Keep the doorway and the cells 4 blocks to each side of it (y=1..6, z=0) clear. Do not put pushable blocks next to the door.
- Open takes about 130 ticks to clear the doorway, about 400 until the mechanism has fully reset. Close about 65 ticks.
- Footprint about 58 x 8 x 56. Schematic: `piston-door-6x6.schem`. Generator: `examples/flat-armN.ts` + `examples/piston-door-6x6.ts`.
