# claudestone

Headless redstone simulator (Java Edition 1.20 rules), built so Claude can build, run and debug circuits.

    npm test
    npx tsx src/cli.ts examples/lever-wire-lamp.json

Blocks: stone, glass, obsidian, slime_block, redstone_wire, redstone_block, lever, stone_button,
redstone_torch, redstone_wall_torch, repeater, comparator, observer, redstone_lamp,
piston, sticky_piston, chest (placeholder: `signal` prop = comparator output).

Conventions: repeater/comparator `facing` = INPUT side. Torch/lever `facing` = direction away from support.

## Accuracy
Rules are ported from memory of the vanilla source, NOT verified against a real game.
Unverified: piston animation timing, wire dot/connection edge cases, lamp/slime conductivity,
observer indirect shape updates, honey blocks, containers/hoppers (phase 3).
