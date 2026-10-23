# claudestone

Headless redstone simulator (Java 1.20 rules) so Claude can build, run and debug redstone. TypeScript, run with `npx tsx`.

**Before designing or changing anything, read `knowledge/LEARNINGS.md`** (conventions, verified mechanics, glue rules,
extender theory, door theory, tooling lessons, roadmap) and `ACCURACY.md` (how far to trust each rule).

- `npm test` runs everything. Add a test for every new build (cycle, glue audit, export round trip, dust states).
- MCP server (`src/mcp.ts`, registered in `.mcp.json`): tools `place fill remove use step read view set_item load_schematic
  export_schematic run_spec` plus `learnings`, `add_learning`, `list_designs`, `build_design`.
- Designs live in `examples/*.ts` and are registered in `src/designs.ts`. Add new ones there.
- Keep replies to the user SHORT. Be honest about what is only simulated. When you learn something, record it with the
  `add_learning` tool (or append to `knowledge/LEARNINGS.md`).
- **Colour convention for builds:** use COLOURED WOOL (all 16 colours exist in the sim as `<colour>_wool`), one colour per part of a build (e.g. trunk yellow, delay rows lime/light blue, comparators magenta, lanes orange, taps red, towers cyan, input purple, remote wire pink, floor light gray), instead of obsidian/stone floors. Use obsidian ONLY where a block must be immovable (e.g. next to slime/honey glue, or pieces a piston must not drag). The 10x10 door keeps obsidian for that reason.

## Working rules (user-approved)
- **Simplest controller first:** build a small dumb version that works, then optimize. No routers/timers per cluster unless needed.
- **Reuse proven parts:** start from existing generators/references (extender, wave controller, elevator, tested refs), don't invent new layouts.
- **Learn as I go:** record each lesson in `knowledge/LEARNINGS.md` and add a small test right away.
