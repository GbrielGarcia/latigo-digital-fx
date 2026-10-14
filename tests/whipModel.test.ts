import { describe, expect, it } from 'vitest';
import { allFinite, makeParams, makeSim, run } from './helpers';

describe('Whip model — handle and rope', () => {
  it('moves the handle towards the pointer target', () => {
    const sim = makeSim();
    run(sim, 0.5);
    sim.pointerMove(1, 0.8);
    run(sim, 1);
    expect(sim.model.gripX).toBeCloseTo(1, 2);
    expect(sim.model.gripY).toBeCloseTo(0.8, 2);
    // Node 0 is attached to the handle tip.
    const r = sim.model.rope;
    expect(r.x[0]).toBeCloseTo(sim.model.handleTipX, 9);
    expect(r.y[0]).toBeCloseTo(sim.model.handleTipY, 9);
  });

  it('clamps the grip inside the view bounds', () => {
    const sim = makeSim();
    sim.setBounds(-2, 2, -1.5, 1.5);
    sim.pointerMove(100, -100);
    run(sim, 2);
    expect(sim.model.gripX).toBeLessThanOrEqual(2 + 1e-9);
    expect(sim.model.gripY).toBeGreaterThanOrEqual(-1.5 - 1e-9);
  });

  it('propagates a perturbation from the handle towards the tip', () => {
    const sim = makeSim();
    run(sim, 2); // settle
    const fastest: number[] = [];
    sim.strike('side');
    run(sim, 0.9, (s) => fastest.push(s.metrics.fastestNode));
    const n = sim.model.rope.nodeCount - 1;
    // Early in the stroke the fastest node is near the handle; later it is near the tip.
    const early = Math.min(...fastest.slice(0, Math.round(fastest.length * 0.25)));
    const late = Math.max(...fastest);
    expect(early).toBeLessThan(n * 0.5);
    expect(late).toBeGreaterThan(n * 0.85);
  });

  it('accelerates the tip well beyond the hand speed', () => {
    const sim = makeSim();
    run(sim, 2);
    let maxGrip = 0;
    let maxTip = 0;
    sim.strike('overhead');
    run(sim, 1.2, (s) => {
      maxGrip = Math.max(maxGrip, s.metrics.gripSpeed);
      maxTip = Math.max(maxTip, s.metrics.tipSpeed);
    });
    expect(maxTip).toBeGreaterThan(maxGrip * 2);
  });

  it('recovers to rest after a strike', () => {
    const sim = makeSim();
    run(sim, 1);
    sim.strike('side');
    run(sim, 5);
    // Energy is gone after a few seconds; the light tip may still sway a bit.
    expect(sim.normalizedEnergy).toBeLessThan(0.01);
    expect(sim.phase).toBe('rest');
    run(sim, 5);
    expect(sim.metrics.tipSpeed).toBeLessThan(0.2);
  });

  it('recovers automatically if the state ever becomes non-finite', () => {
    const sim = makeSim();
    run(sim, 0.2);
    sim.model.rope.x[7] = Number.NaN;
    sim.step(sim.stepper.stepDt);
    expect(allFinite(sim)).toBe(true);
    expect(sim.model.recoveries).toBe(1);
  });

  it('ignores non-finite pointer targets', () => {
    const sim = makeSim();
    sim.pointerMove(Number.NaN, Number.POSITIVE_INFINITY);
    run(sim, 0.5);
    expect(allFinite(sim)).toBe(true);
  });

  it('rebuilds the rope when node count or length change, keeping it healthy', () => {
    const sim = makeSim();
    run(sim, 0.5);
    sim.setParams(makeParams({ nodeCount: 48, length: 3 }));
    expect(sim.model.rope.nodeCount).toBe(48);
    expect(sim.model.rope.length).toBeCloseTo(3, 9);
    run(sim, 1);
    expect(allFinite(sim)).toBe(true);
  });
});

describe('Whip model — reset', () => {
  it('restores a calm state, clears drivers, phases and pending events', () => {
    const sim = makeSim();
    run(sim, 0.5);
    sim.strike('upward', 1.5);
    run(sim, 0.4);
    sim.reset(0.2, 0.3);
    expect(sim.strikeActive).toBe(false);
    expect(sim.phase).toBe('rest');
    expect(sim.drainEvents()).toEqual([]);
    expect(sim.model.gripX).toBe(0.2);
    expect(sim.model.gripY).toBe(0.3);
    expect(sim.model.rope.kineticEnergy(sim.stepper.stepDt)).toBe(0);
  });
});
