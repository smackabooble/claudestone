# 3x3 sticky-piston door

File: `piston-door-3x3.schem` (Sponge v2, Minecraft 1.20.1, 19 wide x 13 tall x 15 deep).
Load with WorldEdit (`//schem load piston-door-3x3` then `//paste`) or Litematica.

**Lever ON = open, OFF = closed.** The lever is on top of the obsidian block at the east side of the room behind
the door (schematic position 15,6,5). Simulator timing: about 26 game ticks to open, 16 to close.

## Why this is harder than the 2x2 door
A sticky piston moves a block only 1 cell. The 8 outer blocks of a 3x3 door can leave the doorway in one move, but
the centre column needs two. So:

| Part | How it moves |
|------|--------------|
| left column (3 stone) | glued to 3 slime blocks hidden in the wall; one sticky piston pulls them 1 block left |
| right column (3 stone) | same, mirrored |
| top centre (1 stone) | one sticky piston above pulls it up 1 block |
| lower centre (2 stone) | glued to 2 slime blocks behind them; a **double piston extender** buried under the door pulls them 2 blocks down into the floor |

The double piston extender is the same tested circuit as `double-piston-extender-vertical`, shifted under the door.

## Control
Lever -> redstone torch inverter -> dust on the floor behind the door:
- left and right pistons: a repeater stub each, through the wall
- top piston: a tower of two torches carries the signal up to y=5, then dust runs over the doorway
- extender: a dust staircase goes down into the floor to the extender's input

## Materials (what the schematic uses)
722 obsidian, 8 slime blocks, 9 stone, 5 sticky pistons, 1 observer, 13 repeaters, 44 redstone dust, 3 redstone torches,
1 lever, 1 glass. The wall, floor and every support block are **obsidian on purpose**: slime glues to any block
that can be pushed, so anything touching the slime must be immovable (or air). Do not swap obsidian for stone
next to the door.

## Front views from the simulator (x across -6..8, y up -4..7; z=0 plane)
`X` obsidian, `#` stone, `s` slime, `P` sticky piston, `=` piston head, `o` observer, `0-f` dust power, `g` glass.
```
CLOSED (front, z=0)
  7 XXXXXXXXXXXXXXX
  6 XXXXXXXXXXXXXXX
  5 XXXXXXXPXXXXXXX
  4 XXXXXXX=XXXXXXX
  3 XXX..s###s..XXX
  2 XXX..s###s..XXX
  1 XXXP=s###s=PXXX
  0 XXXXXXX.XXXXXXX
 -1 ...............
 -2 .....0.........
 -3 .....X.o.......
 -4 ...............

OPEN (front, z=0)
  7 XXXXXXXXXXXXXXX
  6 XXXXXXXXXXXXXXX
  5 XXXXXXXPXXXXXXX
  4 XXXXXXX#XXXXXXX
  3 XXX.s#...#s.XXX
  2 XXX.s#...#s.XXX
  1 XXXPs#...#sPXXX
  0 XXXXXXX#XXXXXXX
 -1 .......#.......
 -2 .....0.........
 -3 .....X.o.......
 -4 ...............
```

## After pasting
Flick the lever on and off once if anything looks off; pasting does not always trigger redstone updates. The file
stores the closed state with the pistons extended.

## Honest limits
Built and tested only in my simulator (Java 1.20 rules written from memory, cross-checked against MCHPRS and wiki
summaries). Your flat and upright double piston extenders worked in the real game, which supports the extender
part, but the slime gluing, the torch tower and this combined layout have not been tried in the real game. In the
simulator it opened and closed 6 times in a row with nothing dragged along, and also with the lever toggled every
40 ticks. If something jams in the real game, tell me which part (left/right column, top block, or lower centre)
and what it did.

Your schematic viewer draws dust corners with an extra arm, so judge the dust in the real game rather than in
that viewer.

Rebuild or change it: `npx tsx examples/piston-door-3x3.ts`
