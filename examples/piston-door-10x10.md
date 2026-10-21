# 10x10 piston door (slime / honey), flush, all glue

**Simulated only (Java 1.20 rules). Not tested in the real game.** Needs your testing, and the quasi-connectivity part is the first thing to check.

- Doorway: x=0..9, y=1..10, one flat plane z=0. Closed = only slime and honey in the doorway.
- 10 rows, each 1 tall, stacked with no gaps. Each row has a quint extender (5 sticky pistons) on each side pulling a 5-block unit 5 blocks out: left unit x=0..4 -> x=-5..-1, right unit x=5..9 -> x=10..14. Slime and honey alternate per row and between the two units of a row.
- Idea from the 10x10 you sent (abfielder): all rows share the controllers. There is only one controller module per side. Each of its tap lanes ends in a zigzag of redstone dust and hoppers beside the stack of pistons (dust may sit on a hopper). The dust powers every second row directly and the rows between by quasi-connectivity, so one lane drives the same piston of all 10 rows.
- Lever OFF = closed, ON = open. Lever + torch inverter at the far north end of the left side. A flat dust bus lies on the floor from the left module to the right one (dust is walkable).
- Keep the doorway and x=-10..19 around z=0 free. Footprint 100 x 11 x 69. Schematic: `piston-door-10x10.schem`.
- In the sim: open in about 170 ticks, closed in about 80.
