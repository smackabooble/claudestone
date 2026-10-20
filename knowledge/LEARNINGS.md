# claudestone: what we have learned

Curated lessons from building and testing redstone in this simulator. Read this before designing anything.
"Real game" = confirmed by the user in actual Minecraft. Everything else is only verified in the simulator.

## 0. Status of trust
- **Confirmed in the real game by the user:** flat double piston extender, upright double piston extender.
- **Only simulated (not confirmed):** 2x2, 3x3, 4x4 piston doors; slime/honey gluing behaviour; torch tower; checkerboard glue.
- The simulator is Java 1.20 rules written from memory, cross-checked against MCHPRS (github.com/MCHPR/MCHPRS) and wiki
  summaries. See ACCURACY.md for per-rule confidence. Never tell the user something is verified unless they tested it.
- The user is on Java 1.21.x, loads schematics through bloxelizer.com, and wants SHORT replies.

## 1. Conventions that bit us (get these right first)
- Coordinates: y up, north = -z, east = +x. Positions are [x, y, z].
- **Repeater/comparator `facing` = the INPUT side** (output is the opposite side). I got this backwards several times.
  `facing` points at the cell the signal comes FROM: input cell = pos + facing, output cell = pos - facing.
  Example: a repeater north of a piston, feeding it southward, has facing = north (its input is further north).
- Observer `facing` = the watched side; its output (and the powered side) is the back.
- Wall torch `facing` = pointing away from its support block (support is at pos - facing).
- Piston `facing` = direction of the head. A piston ignores power from the block it faces.
- Lever/button `face` = floor|wall|ceiling; a floor lever strongly powers the block below it.
- 20 game ticks/s; 1 redstone tick = 2 game ticks. Repeater delay d = 2d game ticks.
- Place supports BEFORE the dust/repeaters/torches that need them; `place()` throws if there is no valid support.

## 2. Mechanics we rely on (simulator behaviour)
- Torch inverts after 2gt. Lamp turns on instantly, off after 4gt. Stone button 20gt. Observer fires 2gt after a change and
  stays on 2gt. Comparator 2gt (1gt after placement). Hopper moves 1 item per 8gt. Dropper fires 4gt after power.
- Pistons: a piston powered during the tick/event phase starts the same tick; otherwise next tick. The moved block
  lands 2gt after the event, in the block-entity phase. Chained pistons fire 3gt apart.
- A piston can push at most **12 blocks** (glue and any pistons it moves included). Extended pistons cannot be pushed or
  pulled; a piston that is still moving cannot be pulled. A sticky piston pulls only the block directly in front of its head.
- A piston ignores power from its front. Power from diagonally above (quasi-connectivity) only counts after a block update.
- Dust on top of a piston pops off when that piston retracts (its base turns into a moving block for 2gt). Power lines go
  beside pistons on a support block, not on them.
- Dust shape: lone dust is a cross (powers all 4 sides), right-click makes a dot. Line ends extend. Corners are L (2 arms).
  Dust climbing a step needs a NON-conductor above the lower dust (air or glass); stone above blocks it.
- Slime conducts power (Bedrock wiki + vanilla default rule); observers and pistons do not.

## 3. Glue (slime / honey)
- Slime and honey stick to ANY adjacent pushable block (stone, retracted pistons, ...). They do not stick to each other.
- Immovable blocks (obsidian) and "destroy" blocks (dust, repeaters, torches) are ignored by the glue. So: build the wall,
  floor and every support next to glue out of **obsidian** (it still conducts power like stone).
- Alternate slime and honey in a checkerboard so neighbouring glued groups stay independent.
- Count the glue toward the 12-block limit: a piston pushing a glued group moves group + the pistons it moves.
  2x2 stone + 4 glue + a 2-block tail + the pistons it pushes = 11-12. That is why doors use 2x2 quadrants.

## 4. Double piston extender (DPE) - the tested building block
- A pushes B, B pushes the tip X: tip travels 2. Order matters: A extends FIRST (B cannot extend before A has moved it),
  and on retraction B retracts first and A last, then B needs ONE extra pulse so it can pull the tip the last block home.
- Circuit idea (both versions): A is "instant on, late off" = OR of a fast repeater and a slow chain; B is "late on" via a
  delay repeater; an observer watching A fires the final pulse into B's home position.
- Timing window: with a single slow repeater the working window was ZERO wide (fragile). Two repeaters in series
  (3+3 repeater ticks) gives a wide window. Defaults that work: fast 1, slow 6, B delay 4 (see examples/arm.ts).
  Always sweep the delays (fast, slow, b) in the simulator and pick a value whose neighbours also pass.
- `examples/arm.ts` is the compact one-sided upright arm (everything at x <= 0, or x >= 0 mirrored) so arms can sit
  side by side. It works mirrored too.
- Flat arm: examples/double-piston-extender.ts. Upright: examples/double-piston-extender-vertical.ts.

## 5. Door design theory (why bigger doors get hard)
- A sticky piston moves a block 1 cell, so a block that must travel k cells needs a k-stage extender (or k pistons).
- In a row, the blocks that leave left stack up behind each other: a left group of L blocks all travel L cells. Same for
  right/up/down groups. So an n x n door needs the centre to travel about n/2 cells:
  3x3 -> 2 (centre only), 4x4 -> 2 (all four quadrants), 5x5/6x6 -> 3, 8x8 -> 4.
- Group size is limited by the 12-block limit, so a door is built from small glued groups (2x2 quadrants), each moved by
  its own extender. 3x3: left column, right column, top-centre via single pistons + the lower-centre pair via a DPE.
  4x4: four quadrants, each with its own DPE, slime/honey checkerboard, top extenders beside the wall with a glue tail.
- Top quadrants rise: put the upright arm beside the door and join it to the quadrant with a short glue tail; its polarity
  is inverted (extension = open), so feed it the OPEN signal (the lever itself) while the bottom ones get the CLOSED
  signal (torch inverter).
- 5x5+ needs a 3-stage extender; 8x8 needs 4-stage. We have NOT built those yet (see section 8).

## 6. Wiring tricks that worked
- Torch inverter: lever on a block, wall torch on the same block; lever ON = bus off.
- Torch tower (2 torches, 3 blocks) carries a signal up 4 blocks without dust.
- Dust staircase down under the floor: floor blocks under each step, glass (non-conductor) in the floor above the lower dust.
- Refresh long dust runs with a repeater (dust loses 1 power per block; extender circuits need >= 7 at their input).
- Comparator in SUBTRACT mode is an AND-NOT gate (input minus side input): useful to gate pulses to one phase.

## 7. Tooling lessons
- Export (`src/export.ts`) writes Sponge .schem with exact block states incl. piston heads. Import must paste RAW
  (`World.setRaw`, no updates), like a real paste; re-running placement in order gives different results (order dependent).
- Stale dust shapes happened because indirect shape updates were missing. Fixed; test/dust-states.test.ts guards it.
- The bloxelizer viewer draws dust with a north arm as a full N-S line (viewer bug); the real game uses Mojang's models.
- Run glue audits: after cycling a door, obsidian/glass positions and stone/slime/honey counts must be unchanged.
- web: minecraft.wiki, bloxelizer.com, Mojang, Paper, Fabric are NOT reachable from the sandbox; raw.githubusercontent.com
  and git clone of public repos ARE (that is how we got MCHPRS and Mojang's blockstate JSON from misode/mcmeta).
- Test recipe for a new build: settle, cycle 6x, 40-50 tick gaps, glue audit, tunnel clear, export->import->works,
  dust-state check, sweep timing for margin.

## 8. Open problems / roadmap
- Triple (3-stage) and quad (4-stage) extenders: needed for 5x5/6x6/8x8. Plan: generalise the DPE controller with
  delayed lever copies (OR of two delays gives "early on / late off"), a gated observer pulse (comparator subtract),
  and delay-chained follow-up pulses. Return sequence for N stages: retract P_N..P_1, then pulse P_N, P_{N-1}, P_N, ...
- Real gaps vs the real game: piston timing details, slime/honey push resolver edge cases, hopper/dropper RNG.

## 9. Lessons log (newest last; the `add_learning` MCP tool appends here)

- Comparator-subtract pulse generator: feed BOTH inputs straight from repeater outputs (rear repeater behind the comparator, side repeater beside it facing away). Via dust the strengths decay/linger and the pulse is only ~2 strong; with repeaters it is a clean 15-strength pulse of (rear delay - side delay) rt, at the falling edge. Verified in sim only (scratch pulse2 test).

- TRIPLE EXTENDER (examples/flat-arm3.ts, design `triple-piston-extender`, sim only): 3 stacked sticky pistons, tip +3.
  Return needs 3 pulses (P3, P2, P3) after P3/P2/P1 turn off. Controller = one trunk of dust (repeater every 8 cells)
  + delay chains per tap; absolute time base K+d, each chain delay = K+d - trunk delay at its branch point.
  OR = two repeaters/dust feeding one dust cell. Pulse = subtract comparator fed by two repeaters.
  Defaults sit inside wide windows (sweep: every waveform tolerates about +-2..3 rt). Dust-only chain heads die
  (15 decay) -> make chains of repeaters (balanced delays) instead of dust + a few repeaters.
  Layout rule: lanes to taps must be 2 apart, modules spread outward (W/E) and the middle lane goes furthest north.
