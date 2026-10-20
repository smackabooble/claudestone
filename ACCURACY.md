# Accuracy ledger (target: Java 1.20, non-experimental redstone)

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
| Piston extend/retract animation (block lands 2gt after event) | LOW | block-entity tick order assumed |
| Lamp / slime / observer / piston conductivity | LOW | lamp=conductor, others not |
| Wire shape (lone dust = cross, right-click = dot, line extension) | medium-high | ported from MCHPRS wire logic |
| Hopper 8gt cooldown, transfer-cooldown rule | medium | |
| Dropper 4gt, seeded slot choice | high / n/a | RNG can't match a real world |
| Update order (west,east,down,up,north,south) | medium-high | |
| HashSet order of wire neighbor updates | medium | emulated Java hash order |

Folk-knowledge tests (`test/known.test.ts`) and a 300-seed fuzz (`test/fuzz.test.ts`) pass; they are not real recordings.

Not simulated: item entities, double chests, wooden doors/trapdoors/gates, note blocks, rails, TNT blast, tripwire,
TNT, dispenser special behaviors, chunk loading, 1.21 changes.

## Cross-check against MCHPRS (github.com/MCHPR/MCHPRS, Rust, targets 1.20.4)
MCHPRS is a *simplified* redstone engine (redstone-tick scheduling, no vanilla update order, no pistons here),
so it only validates rules, not ordering. Compared and agreeing: torch 2gt, lamp on-instant/off-4gt, comparator 2gt,
stone button 20gt, repeater side-locking by diodes only, comparator side inputs (diodes/wire/redstone block),
comparator subtract/compare math, wire power/connection rules, torch/lever/plate strong+weak power.
Adopted from it: lone dust is a cross; repeater default tick priority HIGH; comparator priority HIGH/NORMAL.
Disagreement left as-is (from vanilla memory): repeater "prioritize" requires the front diode to face a different direction.
Not reachable from this environment: minecraft.wiki, bloxelizer.com (DNS blocked).
