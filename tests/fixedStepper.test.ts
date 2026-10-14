import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../src/core/physics/fixedStepper';
import { makeSim } from './helpers';

describe('FixedStepper', () => {
  const make = () => new FixedStepper({ hz: 240, maxStepsPerFrame: 12, maxFrameDelta: 0.1 });

  it('runs the same number of steps regardless of frame rate', () => {
    for (const fps of [30, 60, 75, 144, 240, 360]) {
      const stepper = make();
      let steps = 0;
      for (let f = 0; f < fps * 2; f++) stepper.advance(1 / fps, 1, () => steps++);
      // 2 s at 240 Hz = 480 steps (± 1 for the remainder in the accumulator).
      expect(Math.abs(steps - 480)).toBeLessThanOrEqual(1);
    }
  });

  it('always passes the fixed dt to the step function', () => {
    const stepper = make();
    const seen = new Set<number>();
    for (let f = 0; f < 100; f++) stepper.advance(0.013 + (f % 3) * 0.004, 1, (dt) => seen.add(dt));
    expect([...seen]).toEqual([1 / 240]);
  });

  it('returns an interpolation factor in [0, 1)', () => {
    const stepper = make();
    for (let f = 0; f < 50; f++) {
      const { alpha } = stepper.advance(0.0071, 1, () => undefined);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('limits steps per frame and drops the backlog (no spiral of death)', () => {
    const stepper = new FixedStepper({ hz: 240, maxStepsPerFrame: 4, maxFrameDelta: 1 });
    let steps = 0;
    const r = stepper.advance(0.5, 1, () => steps++);
    expect(steps).toBe(4);
    expect(r.droppedTime).toBeGreaterThan(0);
    // Next small frame is processed normally.
    steps = 0;
    stepper.advance(1 / 60, 1, () => steps++);
    expect(steps).toBeLessThanOrEqual(5);
  });

  it('treats very long frames as pauses', () => {
    const stepper = make();
    let steps = 0;
    stepper.advance(30, 1, () => steps++); // window restored after 30 s
    expect(steps).toBeLessThanOrEqual(12);
    expect(steps).toBe(Math.min(12, Math.floor(0.1 * 240)));
  });

  it('ignores invalid deltas and time scales', () => {
    const stepper = make();
    let steps = 0;
    for (const dt of [Number.NaN, -1, Number.POSITIVE_INFINITY, 0]) stepper.advance(dt, 1, () => steps++);
    stepper.advance(1 / 60, Number.NaN, () => steps++);
    expect(steps).toBe(0);
  });

  it('scales simulated time for slow motion', () => {
    const stepper = make();
    let steps = 0;
    for (let f = 0; f < 120; f++) stepper.advance(1 / 60, 0.25, () => steps++);
    expect(Math.abs(steps - 120)).toBeLessThanOrEqual(1); // 2 s × 0.25 × 240 Hz
  });

  it('produces the same simulation at 30 FPS and 144 FPS', () => {
    const a = makeSim();
    const b = makeSim();
    a.strike('side');
    b.strike('side');
    for (let f = 0; f < 60; f++) a.frame(1 / 30);
    for (let f = 0; f < 288; f++) b.frame(1 / 144);
    expect(Math.abs(a.totalSteps - b.totalSteps)).toBeLessThanOrEqual(1);
    const tip = a.model.rope.nodeCount - 1;
    if (a.totalSteps === b.totalSteps) {
      expect(a.model.rope.x[tip]).toBeCloseTo(b.model.rope.x[tip], 9);
    }
    expect(a.detector.count).toBe(b.detector.count);
  });
});
