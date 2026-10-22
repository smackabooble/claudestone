# Accuracy ledger (rules: Java 1.20 core, validated against the user's real game: Minecraft Java 26.2)

**Target versions: current Java Edition (1.21.x, 26.x) and older.** The sim started as 1.20 rules; real per-tick traces from
26.2 (`knowledge/refs/lum3ndo-real-trace*.txt`, recorded with `tools/doortrace.sc`, replayed with `tools/tracecmp.ts`) are
the ground truth. Where a trace disagrees with the 1.20 rules the sim follows the trace. Status of the lum3ndo 5x5 replay
(2 opens, 2 closes): closing matches the real game exactly for 12 ticks (was 4), opening is still off from the first tick
(12 cells; event order inside the first tick). `World.knobs` and `dirs.rules` are the hooks for version-specific rules.


Nothing here is verified against a real game. "Golden" = a recorded real-Minecraft timeline in `golden/*.json`
(same format as `examples/`); `npm test` fails if the sim disagrees. Add one per rule you can confirm.

| Rule | Confidence | Notes |
|---|---|---|
| Wire decay, 15 limit | high | |
| Repeater delay 2*N game ticks, locking | high | |
| Torch 2gt delay, burnout (8 toggles / 60gt, 160gt recovery) | medium | burnout window details from memory |
| Lamp on instantly, off after 4gt | high | |
| Button 20gt (stone) | high | |
| Comparator 2gt, compare/subtract, container reading | medium-high | placement tick (1gt) from setPlacedBy |
| Observer 2gt delay, 2gt pulse | high | indirect (wire) shape updates not modelled |
| Piston 12-block limit, slime, destroy reactions | medium-high | |
| Piston extend/retract animation (block lands 2gt after event, in block-entity phase) | medium-high | matches wiki + techmcdocs: start same tick if powered in tick/event phase else next tick; arrival 2gt later; chained pistons 3gt apart (tested) |
| Conductivity: lamp, slime = conductor; observer, piston, redstone block, glass, honey = not | medium | lamp (wiki list), slime (Bedrock wiki + default full-collision rule), observer (wiki) corroborated; piston/honey/redstone-block from memory |
| Wire shape (lone dust = cross, right-click = dot, line extension) | medium-high | ported from MCHPRS wire logic |
| Hopper 8gt cooldown, transfer-cooldown rule | medium | |
| Dropper 4gt, seeded slot choice | high / n/a | RNG can't match a real world |
| Update order (west,east,down,up,north,south) | medium-high | |
| HashSet order of wire neighbor updates | medium | emulated Java hash order |

Folk-knowledge tests (`test/known.test.ts`) and a 300-seed fuzz (`test/fuzz.test.ts`) pass; they are not real recordings.

Not simulated: item entities, double chests, wooden doors/trapdoors/gates, note blocks, rails, TNT blast, tripwire,
TNT, dispenser special behaviors, chunk loading, 1.21+/26.x changes (unknown, learn them from traces).
Modelled since the lum3ndo traces: stairs shape, panes, target block (dust connects), hay+campfire, leaves distance, composter level,
moved observers pulse on arrival, CollectingNeighborUpdater ordering, stale hopper/dropper flags kept on import.

## Cross-check against MCHPRS (github.com/MCHPR/MCHPRS, Rust, targets 1.20.4)
MCHPRS is a *simplified* redstone engine (redstone-tick scheduling, no vanilla update order, no pistons here),
so it only validates rules, not ordering. Compared and agreeing: torch 2gt, lamp on-instant/off-4gt, comparator 2gt,
stone button 20gt, repeater side-locking by diodes only, comparator side inputs (diodes/wire/redstone block),
comparator subtract/compare math, wire power/connection rules, torch/lever/plate strong+weak power.
Adopted from it: lone dust is a cross; repeater default tick priority HIGH; comparator priority HIGH/NORMAL.
Disagreement left as-is (from vanilla memory): repeater "prioritize" requires the front diode to face a different direction.
Not reachable from this environment: minecraft.wiki, bloxelizer.com (DNS blocked).

Sources for the piston/conductivity checks were search-result summaries of minecraft.wiki, techmcdocs.github.io and the Bedrock wiki
(pages themselves are not fetchable here). The Bedrock wiki describes Bedrock; Java was inferred from it plus the vanilla default rule.
