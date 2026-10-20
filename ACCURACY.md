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
| Wire dot / connection edge cases | medium | |
| Hopper 8gt cooldown, transfer-cooldown rule | medium | |
| Dropper 4gt, seeded slot choice | high / n/a | RNG can't match a real world |
| Update order (west,east,down,up,north,south) | medium-high | |
| HashSet order of wire neighbor updates | medium | emulated Java hash order |

Folk-knowledge tests (`test/known.test.ts`) and a 300-seed fuzz (`test/fuzz.test.ts`) pass; they are not real recordings.

Not simulated: item entities, double chests, wooden doors/trapdoors/gates, note blocks, rails, TNT blast, tripwire,
TNT, dispenser special behaviors, chunk loading, 1.21 changes.
