# Micro test: two back-to-back observer pulses on a sticky piston

Three copies side by side, each with its own lever (on the small block left of the dust). Flip ONE lever ON, wait 3 seconds,
and look at the STONE under the piston: LOW (pushed down and stayed) or HIGH (pulled back up)?
Then flip the lever OFF and tell me if anything else moves. Re-set the stone to the top by hand between tries.

| copy | what it does | simulator says |
|---|---|---|
| left (x=0) | one 2-tick pulse | LOW |
| middle (x=8) | pulse A, then pulse B right after it | HIGH |
| right (x=16) | pulse A, then pulse B with a 2 tick gap | HIGH |

Real game differs from the table? Tell me which copies. That tells me exactly which piston rule my simulator has wrong.
