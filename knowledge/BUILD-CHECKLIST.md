# FINAL CHECK (do this at the END of every build, before telling the user it is done)

Re-open `knowledge/LEARNINGS.md` (+ `ACCURACY.md`) and `CLAUDE.md` and go through this list. Fix what is wrong, then say honestly what you found.

1. **Rules from the user:** coloured wool, one colour per part; obsidian only where a block must be immovable; NO floors (wool only directly under parts that need support); compact; short reply; honest about "sim only".
2. **Export sanity:** dust is connected (never dots: `exportSchem` calls `settleWires()`), repeater/comparator `facing` = input side, nothing floating that needs support, note blocks stand on the right instrument block (wool under a note block = guitar), lamps/torches given their REST-state values (setRaw does not update).
3. **Real game:** start the lab server (tools/mcserver/start.sh), paste the build, test it in the REAL game (knowledge/REALMC.md), report sim vs real. Flip levers with `clickBlock`, not setblock.
3b. **Behaviour (sim):** truth table / timing / cycle is tested in the sim (`npm test`), and the test is in the repo. Check rest state AND all states, and that nothing else (levers, buttons) leaks power into dust beside it.
4. **Learnings:** did anything surprise me, fail, or turn out a bad idea? Write it down (`add_learning` or knowledge/LEARNINGS.md). If an earlier note was wrong, CORRECT it.
5. **Re-read the user's last message** and compare against what was built: every requested property satisfied?
6. **Report:** list problems found in this check (even small ones), what is verified in the sim, what is not verified in the real game.
7. Commit + push, send the file.
