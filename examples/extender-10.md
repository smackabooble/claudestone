# 10-long piston extender

Simulated only (the quint, N=5, version was confirmed in the real game inside the 10x10 door).

- 10 sticky pistons in a row (x=0..9, y=0, z=0, facing +x), a stone tip at x=10. Lever ON: the tip travels to x=20, OFF: it comes home.
- About 163 x 2 x 128 (mostly dust and repeaters). Lever is at the far north end of the trunk.
- Push limit: P1 pushes 9 pistons + the tip = 10 blocks (limit 12). In the sim N=12 also works, N=13 stops at 12.
- Generator: `examples/extender-long.ts` (`makeArmSpec(n)`); the pulse order that closes the gaps after the retraction is found by a tiny BFS, 4 rt apart.
- Paste at ground level with 21 free blocks east of the arm. Allow ~25 s to extend and ~40 s to come home.
