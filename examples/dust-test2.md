# Dust test 2: every corner and T orientation

File: `dust-test2.schem` (1.20.1, 50 x 2 x 7). Stone floor, eight dust groups in a row, labelled A to H.
Your viewer may show the row mirrored or rotated, so go by the order of the shapes, not left/right.

| Group | Shape | Stored arms of the middle piece | Should look like |
|-------|-------|--------------------------------|------------------|
| A | corner | north + east  | L (shape 4) |
| B | corner | north + west  | L |
| C | corner | south + east  | L |
| D | corner | south + west  | L |
| E | T | east + west + south | T (shape 5) |
| F | T | east + west + north | T |
| G | T | north + south + west | T |
| H | T | north + south + east | T |

Exact states of the middle pieces are in the table above; for example group A is
`redstone_wire[east=side,north=side,power=0,south=none,west=none]`.

## What I expect your viewer to show
From the first test, the viewer drew an extra full-length arm on any dust that has a **north** connection
(a north+west corner looked like a T, a T with a north stem looked like a cross). If that is a viewer quirk:
- C, D, E (no north arm) look right,
- A, B, F, G, H (north arm) show an extra arm.

Please tell me which of A to H look right and which show an extra arm. If it matches, the dust states in my
files are correct and the viewer is drawing the north arm wrongly. The game itself uses Mojang's own dust models.
