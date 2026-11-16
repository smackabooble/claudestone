# 3x3 sand door (simulated only)

File: `sand-door-3x3.schem` (Sponge v2, Minecraft 1.20.1, 19 x 14 x 15). Lever ON = open, OFF = closed (lever at schematic 15,7,5).
Opens in about 26 ticks, closes in about 16 (sim).

A 3x3 piston door whose door blocks are **sand** (8 sand + 2 stone). Mechanism = the plain 3x3 door (`piston-door-3x3.md`):
slime-glued side columns, a top piston, and a buried double extender for the lower centre. Differences because of gravity:

| Block | Why |
|-------|-----|
| side columns, 3 sand each | stand on the obsidian floor before and after being pulled sideways |
| top centre = **stone** | pulled up into an unsupported nook; sand would fall back and close the door |
| lower centre: 2 sand on a **stone support** | gravity ignores slime glue, so the sand needs something under it while the door is closed; the support moves down with it (stone + 2 sand + 3 slime pulled down 2 by the extender, which sits one block deeper than in the plain door) |

Open state: the sand pair stands in the floor (y=-1, 0) on the support; the doorway is clear. Everything that touches slime is obsidian.
Not verified in the real game; falling-block physics in the sim are my model (see knowledge/LEARNINGS.md).
