# claudestone

Headless redstone simulator (Java Edition 1.20 rules), built so Claude can build, run and debug circuits.

    npm test
    npx tsx src/cli.ts examples/lever-wire-lamp.json

Blocks: stone, glass, obsidian, slime_block, redstone_wire, redstone_block, lever, stone_button,
redstone_torch, redstone_wall_torch, repeater, comparator, observer, redstone_lamp,
piston, sticky_piston, chest, barrel, hopper, dropper, dispenser (real item inventories).

Conventions: repeater/comparator `facing` = INPUT side. Torch/lever `facing` = direction away from support.

## Accuracy
Rules are ported from memory of the vanilla source, NOT verified against a real game.
Unverified: piston animation timing, wire dot/connection edge cases, lamp/slime conductivity,
observer indirect shape updates, honey blocks, containers/hoppers (phase 3).

## Schematics
`"schematic": "build.schem"` (Sponge v2\/v3) or `.litematic` in a spec; unsupported blocks become stone with a warning.
Droppers\/dispensers use a seeded java.util.Random (`world.rng`); item entities, double chests and dispenser special behaviors are not simulated.
