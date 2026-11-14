# REAL MINECRAFT LAB SERVER (Fabric + Carpet, void world, Minecraft 26.3 = the user's version)

Purpose: verify builds in the REAL game without the user. Real results beat the simulator.
- Setup (once per container): `tools/mcserver/setup.sh` (downloads Java 25 JRE to /home/user/jdk25, Fabric server + Carpet into /home/user/mcserver, void flat world, RCON on 127.0.0.1:25575, EULA accepted by the user on 2026-11-14). Start: `tools/mcserver/start.sh`. Stop: `rcon('stop')`.
- API: `tools/mcserver/mc.ts`: `rcon(cmd)`, `pasteWorld(simWorld, origin)`, `blockIs(pos, 'minecraft:x[state]')` (execute if block), `clickBlock(stand, target)` (Carpet fake player "Lab").
- Read any real block state: `rcon('script run print(block_state(x,y,z))')` -> `{lit: true, facing: west}`. Per-tick recording: use tools/gearrec.sc through `script load` (not wired to rcon helpers yet).
- Example: `npx tsx tools/mcserver/test-xnor.ts` pastes the XNOR at y=100 and flips levers through all 4 combinations: REAL GAME truth table correct.

## Learned
- Levers/buttons MUST be flipped by a player click (`clickBlock`). `setblock` of a lever with powered=true does not make the block it is attached to notify its neighbours, so torches/dust on that block never react (looks like a design bug but is not).
- The server must run with `pause-when-empty-seconds=-1` or it freezes 60 s after the last player leaves. Chunks need `forceload add x1 z1 x2 z2`, otherwise commands say "That position is not loaded".
- Minecraft 26.x needs Java 25 (class file 69). The container default is Java 21.
- Real-game lamps/torches/dust shapes arrive in their pasted state; the server runs block updates only for neighbours, same as setRaw (paste rest states!).
- Web search (Nov 2026): no Java redstone behaviour changes found 1.21 -> 26.3 in the changelogs I could reach; Carpet has a 26.3 release.
- Real-server tests CLEAN UP after themselves (mc.ts cleanup(): air over the build box, bot platform, kill the fake player); always do this in a finally block.

## Sim vs real diff (tools/mcserver/compare.ts, compare-all.ts) - first full run 2026-11-14: ALL IDENTICAL
8 scenarios (XNOR idle / A / A+B, comparator XOR A / A+B, triple + quad pulse after a button press, 12-piston train after one lever flip): every block's type and every state property equal between the simulator and real Minecraft 26.3 (steady state after the run). Run `npx tsx tools/mcserver/compare-all.ts` after any sim change.
- Bot clicking gotchas (cost an hour): the aim (`player Lab look at`) only applies on the bot's NEXT tick, so wait ~250 ms before `use once` (else it clicks with the old rotation); stand ONE level below a floor lever and 2 blocks away (from 1 block the ray passes above the hitbox); aim y +0.15 for floor levers, +0.5 for wall levers; right after `player Lab kill` the name is taken, so spawn in a retry loop; read states with commas `block_state(x,y,z)` (spaces silently fail and made the harness double-click).
- PASTING INTO A LIVE SERVER CAN START A MACHINE: observer-driven builds (the piston train) ran a full wave by themselves right after the paste (observers placed next to freshly placed parts). The compare harness therefore restores every cell to the sim's initial state after the paste (normalise loop). A lone observer or a frozen-tick paste did NOT pulse, so the exact trigger is unknown. If the user pastes an observer build and it starts moving, this is why.
- Steady-state only so far; per-tick timing (tools/gearrec.sc + labtrace) is the next comparison.
