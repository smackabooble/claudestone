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

- QUAD EXTENDER (examples/flat-armN.ts, design `quad-piston-extender`, sim only). flat-armN.ts is a DATA-DRIVEN generator:
  give it holds {x,on,off} and pulses {x,side,rear} (rt, absolute) and it lays out trunk, lanes, chains, comparators.
  Mechanical sequence for N=4: ON P1..P4 at taps x0,x2,x4,x6; OFF P4,P3,P2,P1; then pulses at taps x5,x3,x4,x1,x2,x3
  (P4,P3,P4,P2,P3,P4 - a bubble-sort of the gaps). After all pistons are off they sit at x0,x1,x3,x5 and the tip at x7.
  Delay margins about +-1..2 rt per waveform (hold off times and pulse widths are the tightest: keep pulse width 3 rt).
  Gotcha: rep(x,z,OUT,..) takes the OUTPUT direction, facing = opposite. Wrong out dir silently breaks pulses.

- 6x6 DOOR (examples/piston-door-6x6.ts, design `piston-door-6x6`, sim only). Design that worked:
  * door blocks are slime/honey themselves (no sheets/tails); rows alternate type; row = left quad (N=2 arm) + right unit of 2 quads (8 blocks, N=4 arm).
  * All arms horizontal, one per row at y=1,3,5, modules one-sided (rows of delay lines extend away from the door),
    stacked every 2 y (floor at y_a, circuits y_a+1, next module's floor directly on top).
  * Taps must be OBSIDIAN next to slime (stone gets dragged).  Xf class in flat-armN.ts mirrors/moves a module.
  * Long lanes need a repeater every ~10 cells (done inside flat-armN.ts, compensated in the chain delays).
  * Riser: dust staircase (1 up per step) joins the three module inputs; every input cell is a repeater (regenerates);
    a missing back-input north of the input repeater silently killed the top row. Bus over the doorway at y=8 on a beam.
  * Lever OFF = closed through a torch inverter. Open ~130 ticks, close ~65.
  * Why centre quads are the problem: any 2x2 quad needs distance 4 for the centre column, so a row is split left quad (2) + right unit (4).

- REAL GAME CONFIRMED (user, Java 1.21.x): the 6x6 door works. That also confirms the flat-armN.ts generator for N=2 and N=4 (one-sided, stacked, obsidian taps) and the slime/honey-as-door-blocks scheme. Triple (flat-arm3) alone and the stand-alone quad were not separately reported.

- 8x8 DOOR (examples/piston-door-8x8.ts, design `piston-door-8x8`, sim only): same recipe as the confirmed 6x6 but every row is two 8-block units (left/right), all 8 arms are N=4 quad modules. Riser got a repeater at lead k=2 (long staircases lose signal) and the bus joins the stair top from OUTSIDE the stair column (a repeater inside the lead blocks signals flowing the other way).

## 10. Lessons from real compact designs (reference: knowledge/refs/compact-3x3.litematic, user supplied)
The reference is a 3x3 door in ONE plane (51 blocks: 10 sticky pistons, 7 observers, 2 hoppers, 1 repeater, 7 dust, 1 lever;
doorway x=3..5,y=6..8 at z=4). The simulator runs it correctly (test/ref-compact3.test.ts: lever closes, reopens, 3 cycles).
What it does differently from my big doors (and what to copy next):
1. NO big extenders. The 9 door blocks rest in a ring of nooks around the opening (left column, right column, top row,
   bottom row) and each is shoved 1-2 cells INTO the opening when closing. Short travel = tiny machine.
2. The centre block is filled by a piston column from below: a sticky piston extends and pushes a stack that includes
   another sticky piston (pistons are pushable blocks), so one pulse moves several blocks.
3. Timing comes from observers chained to each other and to hoppers: an observer watching a hopper fires when the hopper
   gets powered/unpowered (hopper `enabled` is a block-state change), a cheap level->pulse converter. A single repeater
   (delay 4) orders the stages. Compare my multi-hundred-block delay-line controllers.
4. Pistons, observers and stone double as wiring (stone conducts, observer output powers the block behind it).
5. Pushing two sides toward each other (S> at x=1 and S< at x=7) with a gap in between fills the doorway from both ends.
=> Next compact designs should be 'ring of nooks + short pushes + observer chain' not 'whole door slides out'.

- SIM FIX found by the reference door: dust on the BACK of a retracting piston survives in vanilla (the retracting base becomes a moving_piston whose collision shape is the extended base; only its back face is a full face). My sim popped it, so the second cycle of the reference door broke. Rule now: extended piston and retracting source piston are sturdy only on the back face (opposite of facing); retracted piston all faces. Caveat: sides of an extended piston being non-sturdy is from the vanilla shapes (partial boxes), not yet confirmed in the real game. This also means my earlier rule "dust on top of a retracting piston pops" was only true for pistons facing UP/sideways, not for pistons facing DOWN.

- REFERENCE 4x4 (abfielder, knowledge/refs/compact-4x4-abfielder.litematic, 118 blocks: 22 sticky + 4 plain pistons, 24 observers, 4 repeaters, 2 furnaces, no slime). Works in the sim after one importer fix:
  FURNACES ARE IMMOVABLE (block entity). The importer turned them into stone, the stone got pushed and the whole door broke. Now 'furnace' is a conductive, unpushable block (use it like obsidian next to pistons). Other unsupported blocks (wool, iron block) are still imported as stone - fine because they are pushable conductors, but check warnings when a reference misbehaves.
  How it works: doorway x=3..6,y=3..6 at z=2; the 16 door blocks rest in a ring (top row, bottom row, left/right columns). Lever -> bottom pistons (4 SU, powered by dust/stone at once) push the bottom row UP 1; observer chains (the output of one observer watches the next, each hop = 1 observer pulse) fire the top row SD pistons (push down 1) and the side pistons; side columns are pushed in 2 cells by a DOUBLE STACK of sticky pistons (S> next to S>: the back one pushes the front one as a block, so the stone moves 2). Furnaces above the side columns stop the columns from being pushed up/out. Repeaters (delay 4) between observer stages order the phases; every repeater on/off edge pulses the next observer, so one signal gives two pulses (on + off edge).
  Total travel per block is 1-2 cells. That is why it is 10x9x3 instead of my 58x8x56 (6x6) and 73x10x66 (8x8).

## 11. Reference designs round 3 (importer upgrades)
- Importer now keeps container ITEMS from litematic tile entities (`Loaded.items`: droppers, hoppers, barrels); apply with `world.setItem`. Many compact designs hide state in items (a barrel full of unstackable shovels = a permanent comparator signal of 15; item loops dropper<->hopper = clocks).
- New block classes: `leaves` (full dust support, NOT a conductor: used as a non-conducting spacer), `partial` (slabs, stairs, rails, composter, trapdoors...: no dust support, no conduction), `campfire` (block entity, immovable). `SpecBlock.orig` keeps the original vanilla name of anything approximated.
- knowledge/refs/compact-5x5-lum3ndo.litematic (541 blocks, 13x12x5, 76 sticky + 47 plain pistons, 86 observers, hoppers/droppers, comparators, activator rail, tripwire hook, target blocks, campfire, composter...): cannot be driven yet because the trigger is not known and several parts (activator rail, tripwire hook, targets, note blocks, campfire) are not modelled. Needs: the real input position (ask the user).
- knowledge/refs/trapdoor-5x5-minimdino.litematic (193 blocks, 7x4x19): a flush 5x5 floor trapdoor built from vertical sticky pistons lifting 5 slime/honey columns, 13 barrels (immovable block entities) as stops, leaves/note blocks as non-conducting/conducting fillers. Trigger unknown (probably interacting with a barrel or note block).
- Lesson about stacked vertical pistons: a piston also gets power when the cell ABOVE it would be powered (quasi-connectivity), so tap stones that are used to power piston k also power piston k+1 below it. Horizontal arms stacked vertically are fine only when all rows run the same waveform; a vertical double extender (A under B) cannot be controlled with lateral taps. Compact designs avoid this with observers (output only to the block behind them) and horizontal double stacks.
- THE TRIGGERS ARE NOTE BLOCKS (and similar interactive blocks), not levers. Right-clicking a note block changes its `note` property = a block state change an adjacent OBSERVER sees. Both reference doors start from an observer facing a note block ('click to open/close'). Sim: `note_block` block type, `world.use(pos)` clicks it, `world.trace = (msg)=>...` logs observer triggers.
  Observers facing note blocks: lum3ndo 5x5 at (1,1,0)/(11,1,0) [front, z=0] -> observers (1,1,1)/(11,1,1); trapdoor at (6,0,18) (master, fires the 5 observers (1..5,1,17)), (4,1,18),(5,1,18), (6,3,6) (on the door surface).
  Other interactive/world triggers we do not model: target block (arrow), tripwire hook, campfire lit state, barrel/chest open state, activator rail.
- Status of the references in the simulator: abfielder 4x4 = fully works (levered). lum3ndo 5x5: both front note blocks start phase 1 only (left and right blocks move 1 cell into the doorway, 8 of 25 cells), then the chain stops: some later stage is not triggered in my sim (some unmodelled block/behaviour, or a second click is needed). trapdoor: clicking the notes fires the observer chains and pistons cycle but the 25-block slab does not move: the pistons at y=1 that should lift/move it push into air in my import, so something about the slab/platform geometry is not understood yet.
- Quasi-connectivity is USED ON PURPOSE in the references: an observer above the top piston of a vertical pair of horizontal pistons powers both (the lower one via the cell above it), so one observer fires 2 rows. Do not treat it as a bug to avoid.
- TRAPDOOR (Minim_Dino) MECHANISM, found by search (not by the observer wiring yet): it is a PISTON CATERPILLAR. 5 independent slime/honey columns (alternating types, so no glue between columns); sheet A (z6..10, y1) carries the 25-stone slab (y2); sticky pistons G11 (x,1,11) face north behind it, sheet B (z12..15) with a y=0 layer under it (observers/wood/pistons glued to it), G16 (x,1,16) behind that. A piston pushing a chain is limited to 12 blocks, so the pushes MUST be in order: pulse G11 (2gt: slab+sheet A move 1, short pulse = no pull-back, gap left at z10), THEN G16 (pushes sheet B + its y=0 layer + the retracted G11 piston into the gap, 11 blocks), then the y=0 south pistons (moved to z14), then the y=1 north pistons (moved to z15), ... each pair advances everything 1 cell; 6 pulses moved the slab 4 cells (BFS in /tmp scratch: macro-actions = pulse a piston row, dedupe by block hash). Fired in the wrong order (G16 first, which is what the master note block does in my sim) the push is 15+ blocks and fails.
  What is still unknown: the observers (x,0,12)/(x,0,14) (both watching the wood block (x,0,13)) are meant to fire G11/G10 (via stone (x,0,11)) and G15 as the layer shifts; in my sim nothing re-triggers after the first G11 pulse, so the self-propagation does not run. Either an observer/moving-block detail differs from vanilla (an observer carried by a piston, or an observer seeing its watched block replaced by an identical type), or one more start action is needed.
- DIAGNOSTIC TOOLS that now exist: world.trace (observer triggers + 'piston powered but CANNOT extend; ahead: ...' lines), world.use(noteBlock), importer keeps items, `SpecBlock.orig`. 'CANNOT extend' lines also appear in working designs (duplicate checks), so only trust them with the 'ahead:' list.
- lum3ndo 5x5 TRIGGER (from the user's screenshot): a LEVER on the front face of the block above the redstone lamp, i.e. lever at (6,2,-1) attached to (6,2,0); it powers the two sticky pistons beside that block (5,2,0) and (7,2,0), which push redstone blocks and start a ~11 tick cascade of ~60 observer triggers. With it the sim closes 21 of the 25 cells in plane z=2 (empty: (4,8) and the centre column (6,5..7)) at t=11 and does not finish; the real door closes fully (0.9 s). Droppers/hoppers hold a 1-bit open/closed memory (item location read by comparators).
  Known cause of one miss: piston (4,10,2) receives two back-to-back observer pulses (west observer t7-8, then the observer behind the stone above at t9-10) so it stays extended 4 gt and PULLS the stone back; vanilla probably has a 1 gt gap there. Tick-exact timing differences (observer / moving-piston ordering) are the prime suspect; a 0.9 s door is tuned to the gametick.
- lum3ndo check against the user's closed-door screenshot: the real closed door is a solid wall; the redstone blocks at the bottom front (y=0 at x=7,4,1) and beside the lamp row (3,2,0),(9,2,0) are at EXACTLY the positions my sim ends with, so most of the cascade matches vanilla. The sim ends with 4 holes in the 5x5 plane z=2 ((4,8) and the centre column (6,5..7)). No single extra piston pulse or hold fixes it (searched all ~120 pistons), so the divergence is earlier in the cascade. Timing knobs (observer delay 1/3, moving piston step 1/3 or 1, block entities before ticks) all made it worse than the vanilla values. Quasi-connectivity is implemented per vanilla and unit-tested (BUD behaviour).
- REAL-GAME MICRO TEST (examples/microtests/double-pulse.*), user's result: copy 0 (one pulse) LOW = matches the sim; copy 1 (two pulses with no gap) = behaves like one longer pulse (matches); copy 2 (second pulse 2 gt after the first, delivered through a powered stone ABOVE the stone above the piston, i.e. quasi connectivity) = like copy 0 (LOW, the piston did NOT extend again). The sim says HIGH: at t0+6 the retracting base finishes (becomes a piston again, onPlace -> checkIfExtend) in the same tick in which the observer already powered the stone two above it, so it sees the quasi power and extends a second time.
  Calibration attempts (World.knobs, analysis only): making the retracting base finish 1 tick earlier fixes copy 2 but breaks the real-working 4x4 reference reopen; making retraction 1 tick slower fixes copy 2 but breaks the real-verified double extender and the 3x3/4x4 reopen; running block entities before scheduled ticks does not fix it; none improves lum3ndo (stays 21/25). So the difference is not a simple global timing offset. Open suspects: (a) the user's game is 1.21.x, the sim is 1.20; (b) quasi connectivity through a stone that is 2 above (observer-powered) may not be seen by a piston that is finishing its retraction in vanilla; next real-game test: classic BUD check (lever powers a stone above the above-cell, then update the piston by placing a block next to it).
- QUINT extender (N=5) works in the generator (examples/flat-armN.ts QUINT, pulse order from a BFS in the simulator: taps 7 5 3 1 6 4 2 5 3 4). Generator fix: repeaters are now spread evenly along each row (dust dies after 15 cells; long rows with the repeaters bunched at the start lost their signal).
- 12-BLOCK LIMIT KILLS BIGGER GLUED UNITS: when P1 of an N-stage extender fires it pushes P2..PN (N-1 pistons) plus the glued unit, so unit <= 13-N blocks. Quad: 9 (8 used), quint: 8, hex: 7. A 10x10 in the 'left unit + right unit per band' style needs 5-wide units; with quint that is 1 tall (5 blocks) not 2 tall (10): 20 quint modules at pitch 1 (impossible with the stacking scheme, modules need 2 y per arm). A 10-wide door therefore needs a different layout; 8 wide (4+4, quad) x any even height works with the existing generator (8x10 = 5 bands x 2 quads).

## 10x10 door (sim only) - pitch-1 rows with shared dust+hopper ladders (from the abfielder 10x10 reference, knowledge/refs/door-10x10-abfielder.litematic)
- Quint (N=5) with a 5-block unit per row works (4 pistons + 5 = 9 <= 12). 10 rows of 1 tall each get their OWN quint arm on each side, stacked with NO gap (pitch 1), all glue, nothing else visible (the earlier 2-tall-unit versions had piston heads / edge pieces).
- Circuits need 2 y per module, so the rows cannot each have a module. The reference powers all rows from one vertical ZIGZAG of redstone dust over non-conductor blocks (glass there; I use HOPPERS because glass is pushable and slime sticks to it): dust at z=+-1 on even rows powers that row's piston directly and the piston of the row below by QUASI-CONNECTIVITY (piston is also powered when the cell above it would be); dust adjacent to the above-cell also sends the block update to the quasi piston (neighbours of neighbours).
- Dust may sit on a hopper in vanilla (canSurviveOn). A dust staircase over NON-conductor supports only carries power UP (the lower dust reads the upper only if the neighbour cell is a conductor), so feed the ladder at the bottom. 10 dust cells decay to 5: put a repeater just before the ladder (lane z=3).
- Generator: ArmOpts.ladder = H (rows y=1..H share the taps, arm:false skips the dummy arm). Each tap lane is the same waveform as before; only the tap end differs. Door builder: 2 modules (left QUINT oneSided, right mirrored via Xf), flat bus on the floor, lever + torch at the left input.
- Sim: hopper counts as a dust support and an 'up' connection target (src/world.ts).
- Still to check in the real game: quasi-connectivity dust ladder timing, hoppers next to glue.
- REAL GAME CONFIRMED (user): the pitch-1 dust+hopper ladder 10x10 door works. So hoppers as dust supports, quasi-connectivity rows and the ladder fed from the bottom are all correct in vanilla.

## lum3ndo 5x5 vs real game (user captured both states: knowledge/refs/door-10x10-abfielder-real-open/closed.litematic; it is the lum3ndo door + a lever at (6,2,0), lever ON = real closed)
- The user's "10x10-closed/open.litematic" are the lum3ndo 5x5 door in the two real states (same block counts; +1 z for the lever). Sim after lever ON: 61 cells differ from the real closed state (was 21/25 doorway before).
- FOUND SIM BUG 1: STAIRS. Columns of redstone blocks/glass/stairs at x=0 and x=12 (z=5) are shifted by a piston and an OBSERVER watches a STAIR: stairs change their `shape` (inner/outer corner) when a perpendicular stair becomes its neighbour, which an observer sees. The importer made stairs 'partial' with no state, so the observer never fired and the reset piston never fired. Now 'stairs' (bottom half) with vanilla getStairsShape and shape updates (src/world.ts stairShape). Differences 61 -> 43.
- Still different (next suspects): piston at (2,3,2)/(10,3,2) extends in the sim by quasi-power and stays extended, in the real game it ends retracted (the neighbouring piston (2,4,1) extends instead). Composter (6,2,5), tripwire hook (5,10,4), activator rail (5,11,3) are still stateless 'partial' blocks (rails/hooks/composters can also change state and trigger observers). Need an intermediate real-game snapshot to localize timing.

## Real per-tick trace of lum3ndo (knowledge/refs/lum3ndo-real-trace.txt, recorded with tools/doortrace.sc on the user's game; replay: `npx tsx tools/tracecmp.ts <trace> 103,-8,232 1`)
- Trace: initial state, lever OFF at T197 (open), lever ON at T248 (close). Block coords: schematic (x,y,z) = world (x-97... i.e. x+97, y-10, z+232). Box x97..109 y-10..1 z232..237.
- Real cadence: events every 2nd tick (T197, 199, 201 ... 219 for opening: 23 ticks). The sim has exactly the same cadence and length (sim tick k after the click = real T197+k-1, OFFSET 1).
- Per-piston comparison of when each piston extended/head appeared: 62 same tick, 10 sim earlier, 3 later, 37 never happen in the sim. The first divergence: the vertical column x=103,z=235 (sticky piston at y=0 pushing stones down). In the real game it starts moving in the very first tick, in the sim it starts only at t+5, so some earlier-stage trigger is slower or missing in the sim. Also (99..107,-3..-6,233) pistons: real tick 18, sim tick 12.
- tools/tracecmp.ts compares whole-region state per tick; the baseline mismatch at T+0 is 23 cells (all in the first moving column).
- Knob sweep against the real trace (tools/tracesweep.ts, total differing cells over the first 24 ticks): defaults (entitiesFirst off, retractBaseSkip off) at offset 1 are best (1746); entitiesFirst or retractBaseSkip make it worse (2100-2300). So the global timing knobs are NOT the problem.
- Unexplained in the real trace: at T197 a sticky piston is at (103,-2,235) where the starting state has a brick, and 3 pistons ((105,-10,236),(99,-7,234),(107,-7,234)) vanish into air; pistons appear to be carried by others between the start state and the first recorded tick. Either the first recorded tick contains more than one game tick of movement, or the snapshots are taken mid-tick. Next idea: make doortrace.sc log EVERY tick (also unchanged ones) and use the tick of the click as reference; or freeze + step.

## SIM FIDELITY FIXES FOUND WITH THE REAL lum3ndo TRACE (knowledge/refs/lum3ndo-real-trace2.txt, tools/tracecmp.ts)
Alignment: the click is processed at the start of a tick, the Carpet scan is at the end of the same tick; real T(click+1) = sim after use()+run(1) (offset 1). Real events come every 2nd tick. Default tick order (scheduled ticks, block events, block entities) is the best (entitiesFirst makes it much worse, tools/tracesweep.ts).
Close phase (from the real open state): exact match for 4 ticks at the start -> now EXACT for 10 ticks, 16 cells differ after 29 ticks (was 46). Fixes, in the order found:
1. STAIRS: shape (inner/outer) changes when a perpendicular stair becomes a neighbour; observers watch it (columns of redstone blocks at the sides).
2. TARGET BLOCK: a solid conductor like stone but isSignalSource => redstone dust CONNECTS to it (side) and powers it; was imported as stone, so dust did not point at it.
3. GLASS PANES / IRON BARS: connection flags (north/east/south/west) follow neighbours; observers watch them.
4. HAY BLOCK + CAMPFIRE: campfire signal_fire = block below is hay; observers watch it.
5. STALE STATES: the importer dropped hopper `enabled` and dropper `triggered`. Saved/real worlds contain stale values (hopper enabled=false with no power) and the first neighbour update flips them, which an observer sees. Keep them when importing.
6. MOVED BLOCKS GET updateShape FROM ALL SIX SIDES when a piston finishes moving them (PistonMovingBlockEntity: Block.updateFromNeighbourShapes). An OBSERVER that arrives therefore starts its own pulse (facing any direction). Also ObserverBlock.onPlace: an observer that arrives POWERED with no scheduled tick switches itself off (flags 18) and updates the block behind it.
7. LEAVES: distance (1..7) follows logs/leaves within 6 blocks (updateShape schedules a 1-tick tick, tick recomputes); observers watch it. Logs have distance 0.
Still open: open phase (starting from the closed state) differs from the first tick (14 cells; e.g. a sticky piston appears at (103,-2,235) in the real trace where the closed state has a brick: unexplained, maybe more stale state), and the close phase drifts after tick 10: a piston (103,0,237) is blocked in the sim by a moving_piston at (103,0,235) but extends in the real game in the same tick.
Method that worked: replay the trace, find the first tick where cells differ, look at what the real cell/observer reacted to (tools: tracecmp.ts, tracesweep.ts, Carpet doortrace.sc), implement the missing block behaviour.
