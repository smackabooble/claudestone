# REAL MINECRAFT LAB SERVER (Fabric + Carpet, void world, Minecraft 26.3 = the user's version)

Purpose: verify builds and fix the simulator against the REAL game without the user. Real results beat the simulator. Everything here lives in `tools/mcserver/`.
Status of trust: the simulator now matches the real game tick by tick on most things we tried (see "Results"); the open problem is the lum3ndo door reopening (bottom).

## 1. Set up and run
- Once per container: `tools/mcserver/setup.sh` (Java 25 JRE into /home/user/jdk25, Fabric server + Carpet 26.3 into /home/user/mcserver, void flat world, RCON 127.0.0.1:25575, EULA accepted by the user on 2026-11-14, whitelist on with KALAKARITZU only, copies the Carpet apps `*.sc`).
- Start: `tools/mcserver/start.sh` (the server dies between turns of the cloud session now and then: just start it again at the beginning of every command that needs it). Stop: `rcon('stop')`.
- The container is reclaimed after inactivity: everything outside the repo (server, Java, world) is lost and rebuilt by setup.sh in 1-2 minutes. The server cannot be joined by the user (localhost only, the VM blocks UDP, so playit.gg did not work; the user decided not to pursue it).
- Minecraft 26.x needs Java 25. The server needs `pause-when-empty-seconds=-1` and `forceload` on the test area.

## 2. Tools (what exists)
| file | what it does |
|---|---|
| `mc.ts` | `rcon(cmd)`, `pasteWorld(sim, origin)` (setblock, with updates), `pasteNoUpdates(cells, items, tag)` (EXACT paste, see 3), `clickBlock(stand, target)` (Carpet fake player "Lab"), `pullLever(pos)` (player-phase pull without the bot), `blockIs`, `cleanup` |
| `dump.sc` | Carpet app: `/dump x1 y1 z1 x2 y2 z2 name` writes every non-air block (state) AND container contents to `world/scripts/dump.data/<name>.txt` |
| `paste.sc` | Carpet app: `/paste name` places blocks + container items from `paste.data/<name>.txt` with `without_updates` |
| `compare.ts`, `compare-all.ts` | steady-state sim vs real for small builds (XNOR, XOR, pulses, piston train): all identical |
| `compare2.ts` | steady-state sim vs real for every registered design in `src/designs.ts` (lever ON then OFF, N ticks each); `TICKS=1500`, `ALL=1` |
| `tickdiff.ts` | PER-TICK sim vs real (slow motion, one snapshot per tick); see 4 |
| `replay.ts` | OFFLINE sim vs a saved real recording, seconds, no server; see 4 |
| `tracereal.ts` | replay the user's own Carpet traces in my server (they start mid-motion, so only a rough tool) |
| `test-xnor.ts`, `test-lfsr.ts` | real-game checks of the XNOR gate and the 4-bit LFSR (15 states) |

## 3. Gotchas (each cost real time)
- Levers/buttons must be flipped by a player click. `setblock` of a lever does not notify the block it is attached to. The bot: stand 2 blocks away and ONE level below a floor lever, aim at the hitbox (floor y+0.15, wall pushed back towards its wall), wait ~250 ms between `look at` and `use once` (the rotation applies next tick), spawn in a retry loop after `player Lab kill`, read states with commas `block_state(x,y,z)` (spaces silently fail). A bot click runs in the entity phase, a player's click before the level tick (`pullLever` emulates it; it made no difference to the door result).
- A normal paste of a running machine is NOT faithful: extended pistons without power retract at once, observers placed next to fresh parts pulse and start the machine, supports/power order matters (113 of 589 cells of the user's closed door were lost). Use `pasteNoUpdates` (Carpet `without_updates`): the snapshot is reproduced block for block, including unpowered extended pistons and stale dust/comparator states, which then only change when a real update reaches them. Always check the "paste fidelity" line of tickdiff. (Older fallback: tickdiff `ORDER=B CONVERGE=6`.)
- Comparator block-entity data (OutputSignal), hopper cooldowns and scheduled ticks are not captured by any paste.
- `tick freeze` + `tick step` gave inconsistent results. Reliable: `tick rate 1`, then read `time query gametime` and `/dump` between ticks; keep a snapshot only if the game time did not change during the dump. `tick sprint N` to settle quickly.
- Real-server nondeterminism: the same paste + click gives identical runs 2 times out of 3 and a 1-2 tick shift of one observer chain in the third. Treat one-off differences as noise.
- Real tests must clean up (cleanup(): air over the build box, remove the bot platform, kill the bot) in a `finally`.
- Importer/export facts found with the real game: top slabs (stand-in `leaves` with `slab:true`) export as `stone_slab[type=top]`, hold dust on top only, dust climbing a slab side is `side`; campfire keeps `signal_fire`; concrete powder imports as `sand` (falls); container items are part of the machine (the door's barrel of 27 shovels sets a comparator level).

## 4. Per-tick workflow (how the simulator gets fixed)
1. `NOUPD=1 RAW=1 CASE=closed SAVE=knowledge/refs/real/<name>.json DOOR="4,8,4,8,3" FIX=<reference file> TICKS=100 npx tsx tools/mcserver/tickdiff.ts` : exact paste of the file, bot/slow-motion lever flip, snapshot per tick, sim built from the real settled dump, per-tick diff, optional recording.
2. `npx tsx tools/mcserver/replay.ts knowledge/refs/real/<name>.json 0 60` : offline diff; objective = total differing cells. Debug env: `WATCH="x,y,z;..."`, `DEBUGP="x,y,z"` (every recompute of one dust and who caused it), `DEBUGT=n` (ticking blocks), `DEBUGSIG=1`, `SHOW=n`.
3. First differing tick -> read the cells -> fix the rule in `src/world.ts` -> rerun -> add a regression test in `test/lab.test.ts` -> note in LEARNINGS.md.

## 5. Results (2026-11-14/15)
- XNOR, comparator XOR, 3/4-pulse, 12-piston train, 4-bit LFSR: sim == real.
- 25 registered designs (compare2): 17 identical after ON and OFF (extenders, doors 2x2..4x4, sand door, wave extenders); differing: doors 5x5/6x6/8x8/10x10 and extender-10 (before the lum3ndo fixes; not rerun); not testable (no bot spot): lamp-display, elevator-6, gear-set.
- abfielder compact 4x4: identical in sim and real.
- lum3ndo 5x5: from the user's REAL open state the lever closes it and the sim ends EXACTLY in the user's REAL closed file (test in test/lab.test.ts), and sim == real tick by tick for close (90-220 ticks) and for a first reopen with the old paste.
- Reopening from the user's exact closed state: real server 4/25 doorway cells filled after 200 ticks (13 cells from the user's open file), sim 10/25 (53 cells away). UNSOLVED. First consequential difference (ticks 3-5): a stale dust line (23..26,110,21 in recording coordinates) is recomputed in the sim but stays stale in the real game, starting a piston chain 1-2 ticks early in the sim. A micro test shows the dust algorithm itself matches, so a source/notification specific to the door is missing. Ideas not yet tried: comparator OutputSignal in the BE, observer `updateNeighborsInFront` notification order.
- The note-block triggers of compact-5x5-lum3ndo.litematic do nothing in sim and real; the lever (6,2,0 of the real fixtures) is what closes the door.

## 6. Other facts
- Web search (Nov 2026): no Java redstone behaviour changes found 1.21 -> 26.3 in the changelogs reachable; Carpet has a 26.3 release.
- The user's own Carpet traces (knowledge/refs/lum3ndo-real-trace*.txt) start while the door is still moving, so their "initial state" is not a clean start; their doorway counts are still ground truth (reopen: 16 filled at T+0 -> 0 at T+16).
