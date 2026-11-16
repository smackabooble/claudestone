# Lamp display (7-segment, 10 buttons)

Simulated only (never tried in the real game). Size 100 x 13 x 34 (x, y, z).

- Paste `lamp-display.schem`. It starts showing 8; press CLR once to blank it.
- Button panel at the west end (x=6 in the schematic), one button per row, 2 blocks apart:
  button 0 is the southernmost (z=20), button 9 the northernmost (z=2). CLR is at the south of the panel (x=4, z=30).
- Screen at the east end (x=98): 9 lamps wide, 5 rows (y=3..11 in steps of 2). The segments are lamp rows, a bit stretched.
- Press a button: all digit latches clear, then that digit's latch sets (about 2 seconds). Wait ~4 s between presses.
- How it works: 10 NOR latches (2 torches each), one per digit. Each latch drives two torch towers (true / inverted)
  that carry the signal up to the heights of the 7 segment buses, so wires never cross. Each bus is the OR of the
  digits that use that segment. Lamps light from dust on top of them.
- Tests: `test/lamp-display.test.ts` (every digit, random order, export round trip).
