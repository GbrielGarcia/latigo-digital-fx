# Physics model and simplifications

Látigo Digital FX aims for a **convincing and stable** whip, inspired by known physical principles. It does not claim to reproduce real whip physics exactly.

## Model

| Element     | Implementation                                                                                                                                                                           | File                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Rope        | `N` point masses (8–96, default 32) joined by distance constraints                                                                                                                       | `src/core/physics/rope.ts`         |
| Integration | Position Verlet with linear air damping `v *= exp(-c·dt)` and gravity 9.81 m/s²                                                                                                          | `Rope.integrate`                   |
| Constraints | Gauss-Seidel position-based projection, mass weighted, `iterations` sweeps per step (8–24)                                                                                               | `Rope.solve`                       |
| Bending     | Compression-only constraint between nodes `i` and `i+2`; stiffness converted per iteration (`1-(1-k)^(1/n)`) so it does not depend on the iteration count; fades by 75 % towards the tip | `Rope.solve`                       |
| Taper       | Node mass `m_i = m₀ (1 − 0.92·t)²`; the handle node has infinite mass                                                                                                                    | `Rope` constructor                 |
| Handle      | Kinematic grip that follows the target with exponential smoothing and a speed cap; a rigid 0.32 m stick tilts with the grip velocity (wrist flick)                                       | `src/core/whip/whipModel.ts`       |
| Strike      | Scripted grip trajectory: wind-up → fast eased stroke → abrupt stop                                                                                                                      | `src/core/whip/strikeDriver.ts`    |
| Time step   | Fixed 120/180/240/360 Hz; accumulator, ≤ 24 steps per frame, frames > 100 ms clamped                                                                                                     | `src/core/physics/fixedStepper.ts` |

### Why the tip accelerates

When the handle stops abruptly, the loop created by the stroke keeps travelling along the rope. Each constraint projection moves the lighter node more than the heavier one (inverse-mass weighting), so the same momentum carried into ever lighter segments produces ever higher speeds. With the default settings the measured tip speed is **2–5× the hand speed** (see `tests/whipModel.test.ts`, "accelerates the tip well beyond the hand speed"). Real whips reach much larger ratios.

## Crack detection

`src/core/whip/crackDetector.ts`

1. **Arm** when tip speed < `low` (35 % of the threshold) — hysteresis.
2. **Candidate** when tip speed > `high` (the crack threshold).
3. **Track the peak** while speed keeps rising.
4. **Confirm** when speed falls below 80 % of the peak (or below `high`).
5. **Refractory**: no new event within 0.22 s.

The threshold is `30 m/s · √(L / 2.2 m) · qualityScale` (`low` 0.7, `medium` 0.85, `high` 1.0, `ultra` 1.1). Coarser ropes amplify less, so their threshold is lower; longer whips reach higher tip speeds, so theirs is higher. Intensity is derived from how far the peak exceeds the threshold.

## Stability safeguards

- Per-node displacement capped to `maxNodeSpeed · dt` (650 m/s).
- Grip speed capped (45 m/s) and clamped to the visible area.
- Non-finite pointer targets are ignored.
- After each step the rope is checked (`isHealthy`); any NaN/Infinity or coordinates beyond 10 km reset the rope to rest at the handle and increment `recoveries` (shown in lab mode).
- Long frames (window hidden/minimised) are clamped; backlog beyond the step cap is dropped.

## Simplifications (honest list)

- **2D** side view; no torsion, no rotation of the cross-section, no out-of-plane loops.
- **Inextensible** rope via constraints; no axial elasticity or wave speed derived from tension.
- **Linear** air damping, uniform along the rope; real drag is quadratic and strongest at the fall/cracker.
- **Kinematic hand**: the hand is not affected by the rope (no reaction forces).
- The crack is a **speed threshold**, not a shock-wave computation. Real cracks happen when the tip exceeds the speed of sound (~343 m/s); our tuned threshold is ~30 m/s at the default length.
- **No collisions** (floor, self-collision, targets).
- Bending is compression-only (resists folding but not stretching beyond straight).
- Parameter values (mass, taper, stiffness, damping) were chosen by measurement for plausibility and robustness, not fitted to experimental data.

## Phases

`src/core/whip/phaseMachine.ts` derives the displayed phase from live signals (grip speed, tip speed, normalised kinetic energy, pointer state, crack events, refractory time). Dragging always shows _Preparación_/_Carga_; a crack forces _Chasquido_ for 70 ms; _Recuperación_ and _Enfriamiento_ last until energy and refractory time settle.
