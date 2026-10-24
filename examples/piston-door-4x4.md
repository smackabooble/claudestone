# 4x4 sticky-piston door

File: `piston-door-4x4.schem` (Sponge v2, Minecraft 1.20.1, 22 wide x 13 tall x 19 deep).
Load with WorldEdit (`//schem load piston-door-4x4` then `//paste`) or Litematica.

**Lever ON = open, OFF = closed.** The lever is on top of the obsidian block in the room behind the door
(schematic position 15,6,14). Simulator timing: about 24 game ticks to open, 26 to close.

## How it works
A sticky piston moves a block only 1 cell, and one piston action can move at most 12 blocks (glue included).
In a 4x4 door the four inner blocks need to travel 2 cells, and 16 stone plus glue is far over 12. So the door is
split into **four 2x2 quadrants**, each with its own double piston extender (the tested circuit, rebuilt narrower so
four of them fit):

| Quadrant | Glue | Moves | Extender |
|----------|------|-------|----------|
| bottom-left  | slime | 2 blocks **down** into the floor | buried under the door |
| bottom-right | honey | 2 blocks **down** into the floor | buried under the door |
| top-left     | honey | 2 blocks **up** into the wall | in the wall left of the door, reaches in through a 2-block honey "tail" |
| top-right    | slime | 2 blocks **up** into the wall | in the wall right of the door, through a 2-block slime tail |

Each quadrant is 4 stone glued to a 2x2 sheet of slime or honey directly behind it. **Slime and honey do not stick
to each other**, so alternating them in a checkerboard keeps the four quadrants independent even though the sheets
touch. (The bottom extenders extend to close; the top extenders extend to open, so they get the opposite signal.)

## Control
Lever -> two buses: a torch inverter feeds the bottom extenders (on while the door is closed); the lever's own signal
feeds the top extenders (on while it is open). Dust staircases carry the bottom signal down under the floor.

## Materials
1026 obsidian, 10 slime blocks, 10 honey blocks, 16 stone, 8 sticky pistons, 4 observers, 28 repeaters, 100 redstone
dust, 1 redstone torch, 1 lever, 2 glass. Everything touching slime or honey is **obsidian on purpose** (they glue to
any block that can be pushed). Do not swap obsidian for stone near the door. The wall is 3 thick plus a plain obsidian
front cover that hides the top extenders' circuits.

## Views from the simulator (x across -7..10, y up -4..8)
`X` obsidian, `#` stone, `s` slime, `h` honey, `P` sticky piston, `=` piston head, `o` observer, `0-f` dust, `g` glass.
```
CLOSED, door plane z=0
  8 XXXXXXXXXXXXXXXXXX
  7 XXXXXXXXXXXXXXXXXX
  6 XXXXXXX....XXXXXXX
  5 XXX...X....X...XXX
  4 XXX...X####X...XXX
  3 XXX0..X####X..0XXX
  2 XXXX.oX####Xo.XXXX
  1 XXX...X####X...XXX
  0 XXXXXXX....XXXXXXX
 -1 ..................
 -2 .....0......0.....
 -3 .....X.o..o.X.....
 -4 ..................

OPEN, door plane z=0
  8 XXXXXXXXXXXXXXXXXX
  7 XXXXXXXXXXXXXXXXXX
  6 XXXXXXX####XXXXXXX
  5 XXX...X####X...XXX
  4 XXX...X....X...XXX
  3 XXX0..X....X..0XXX
  2 XXXX.oX....Xo.XXXX
  1 XXX...X....X...XXX
  0 XXXXXXX####XXXXXXX
 -1 .......####.......
 -2 .....0......0.....
 -3 .....X.o..o.X.....
 -4 ..................

CLOSED, glue plane z=1
  8 XXXXXXXXXXXXXXXXXX
  7 XXXXXXXXXXXXXXXXXX
  6 XXXXX........XXXXX
  5 XXX............XXX
  4 XXX..hhhhssss..XXX
  3 XXX0rPXhhssXPr0XXX
  2 XXXXXPXsshhXPXXXXX
  1 XXX...XsshhX...XXX
  0 XXXXXXX=..=XXXXXXX
 -1 .......P..P.......
 -2 .....0r=..=r0.....
 -3 .....XXP..PXX.....
 -4 ..................

OPEN, glue plane z=1
  8 XXXXXXXXXXXXXXXXXX
  7 XXXXXXXXXXXXXXXXXX
  6 XXXXXhhhhssssXXXXX
  5 XXX..=.hhss.=..XXX
  4 XXX..P......P..XXX
  3 XXX0r=X....X=r0XXX
  2 XXXXXPX....XPXXXXX
  1 XXX...X....X...XXX
  0 XXXXXXXsshhXXXXXXX
 -1 .......sshh.......
 -2 .....0rP..Pr0.....
 -3 .....XXP..PXX.....
 -4 ..................
```

## After pasting
The file stores the closed state with the pistons extended. If anything looks off, flick the lever on and off once;
pasting does not always trigger redstone updates.

## Honest limits
Built and tested only in my simulator (Java 1.20 rules written from memory, cross-checked against MCHPRS and wiki
summaries). Your flat and upright double piston extenders worked in the real game, which supports the extender
part. The slime/honey gluing, the checkerboard (honey and slime not sticking to each other), the tails and this
combined layout have not been tried in the real game. In the simulator it opened and closed 6 times in a row with the
doorway completely clear and nothing dragged along, and also with the lever toggled every 50 ticks, and after
exporting and re-importing. If something jams in the real game, tell me which quadrant it is and what it did.

Your schematic viewer draws dust corners with an extra arm, so judge the dust in the real game rather than in that viewer.

Rebuild or change it: `npx tsx examples/piston-door-4x4.ts` (the extender is in `examples/arm.ts`).
