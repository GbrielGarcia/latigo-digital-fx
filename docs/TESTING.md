# Testing, performance and their limits

## Automated tests

Run with `npm test` (Vitest, Node environment — no DOM, no audio device, no Electron). Randomness uses seeded generators (`createRng`), so results are deterministic.

| #   | Requirement                | Where                                                                                                                                                 |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Whip initialisation        | `rope.test.ts` — node layout, masses, clamping                                                                                                        |
| 2   | Segment length             | `rope.test.ts` — < 5 % deviation while swinging                                                                                                       |
| 3   | Stability at rest          | `rope.test.ts`, `simulation.test.ts` — no motion, no crack after 10 s                                                                                 |
| 4   | Handle movement            | `whipModel.test.ts` — follows target, clamped to bounds, node 0 attached                                                                              |
| 5   | Wave propagation           | `whipModel.test.ts` — fastest node moves from the handle half to the last 15 % of the rope                                                            |
| 6   | Recovery                   | `whipModel.test.ts` — energy < 1 % after 5 s, tip < 0.2 m/s after 10 s, phase back to rest                                                            |
| 7   | High-speed stability       | `rope.test.ts` (teleporting anchor), `simulation.test.ts` (violent pointer)                                                                           |
| 8   | No NaN / Infinity          | NaN injection recovery, non-finite pointer targets, non-finite detector samples                                                                       |
| 9   | Fixed time step            | `fixedStepper.test.ts` — same steps at 30–360 FPS, constant dt, alpha range, step cap, pause clamp, slow motion, identical results at 30 vs 144 FPS   |
| 10  | Event detection            | `crackDetector.test.ts` (synthetic signals) + `simulation.test.ts` (every quality × strike style cracks, weak strike does not, drag & release cracks) |
| 11  | Duplicate sound prevention | `audio.test.ts` — same id, min interval, voice cap, expiry                                                                                            |
| 12  | Reset                      | `whipModel.test.ts` — drivers, phases, events and energy cleared                                                                                      |
| 13  | Settings loading           | `settings.test.ts` — defaults, round-trip, clamping, type checks, unknown keys dropped                                                                |
| 14  | Corrupt settings recovery  | `settings.test.ts` — invalid JSON, non-objects, oversized, backup file kept, re-save                                                                  |
| 15  | Physics without UI/audio   | `simulation.test.ts` — asserts `window`/`AudioContext` are absent and runs 600 frames                                                                 |

Additional suites: audio synthesis (finite, normalised, attack < 3 ms, decay, determinism), particles/effects/trail bounds and accessibility switches, spline, camera mapping, frame statistics, UI value formatting.

**Result at the initial commit (macOS 26.6, arm64, Node 26.2):** 8 files, 79 tests, all passing.

## Smoke test (integration)

`npm run smoke` builds and launches the real Electron app with `--smoke-test`. The renderer waits for the frame loop, performs an upward strike, observes 2.5 s of simulated time and reports through IPC; the process exits 0 only if physics advanced and the rope is healthy. Settings use a temporary directory.

Measured on the development machine:

```
SMOKE_REPORT {"ok":true,"steps":624,"cracks":2,"audioStatus":"running","renderer":"canvas2d","fps":60}
```

The packaged app (`release/mac-arm64/Latigo Digital FX.app`) reported `{"ok":true,"steps":620,"cracks":2,"audioStatus":"running","renderer":"canvas2d","fps":60}`.

## Performance profile

`npm run bench` measures the physics cost per step for each quality (20 s simulated, strikes every 1.5 s). Measured on an Apple Silicon Mac (macOS 26.6, Node 26.2) at the initial commit:

| Quality | Nodes | Hz  | Iterations | µs / step | Physics ms per 60 FPS frame |
| ------- | ----- | --- | ---------- | --------- | --------------------------- |
| low     | 16    | 120 | 8          | 2.97      | 0.006                       |
| medium  | 24    | 180 | 12         | 3.62      | 0.011                       |
| high    | 32    | 240 | 16         | 5.97      | 0.024                       |
| ultra   | 48    | 360 | 24         | 12.84     | 0.077                       |

Values vary between runs and machines; re-run the benchmark rather than relying on these numbers. Rendering cost is not part of the benchmark; the lab mode shows live FPS and worst frame time, and the smoke test reported 60 FPS (display-limited) on the same machine.

## Limits of the test suite

- No automated end-to-end UI tests (clicking controls, keyboard shortcuts in the real window). These were checked manually in the browser preview and by the smoke test only.
- Audio playback (`AudioEngine`) is not unit tested because Node has no Web Audio; the pure synthesis and gate are. The smoke test confirms the audio context reaches `running` on macOS.
- Rendering output is not compared pixel by pixel.
- Windows and Linux have not been executed; the CI workflow is prepared but has not run.
- Physics tests check qualitative behaviour (propagation, amplification, stability), not agreement with experimental whip data.
