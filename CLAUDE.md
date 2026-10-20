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
