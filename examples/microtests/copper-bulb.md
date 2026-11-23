# Copper bulb micro test (one lever)

Paste `copper-bulb.schem` (48 x 2 x 10). Lever at the west end of the bus, five copies west to east:
A dust against the bulb, B repeater into the bulb, C observer pulse into the bulb, D two overlapping repeaters (delay 1 and 4),
E sticky piston pushing the bulb next to a redstone block. Each bulb has a comparator reading it with a dust cell behind it.

Exact recording (one line per game tick):
1. `/doortrace start <corner> <opposite corner>` over the whole schematic (go a block outside it)
2. `/doortrace freeze`
3. right-click the lever, `/doortrace go 40`  (wait for it to finish)
4. repeat step 3 five more times (6 flips: ON OFF ON OFF ON OFF)
5. `/doortrace stop` and `/tick unfreeze`; send me the trace file.

Sim guess to check: the bulb flips `lit` on each rising edge of power (never on the falling edge), instantly; comparator output 15 when lit.
Guess for E: the bulb flips when it arrives next to the redstone block.
