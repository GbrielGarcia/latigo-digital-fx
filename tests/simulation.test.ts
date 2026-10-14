import { describe, expect, it } from 'vitest';
import { DemoDirector } from '../src/core/modes/demoDirector';
import { TrainingSession } from '../src/core/modes/trainingSession';
import type { QualityLevel } from '../src/core/whip/params';
import type { StrikeStyle } from '../src/core/whip/strikeDriver';
import { allFinite, makeSim, run } from './helpers';

describe('Simulation — headless execution', () => {
  it('runs without any DOM, renderer or audio', () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    expect(typeof (globalThis as { AudioContext?: unknown }).AudioContext).toBe('undefined');
    const sim = makeSim();
    for (let f = 0; f < 600; f++) sim.frame(1 / 60);
    expect(sim.totalSteps).toBeGreaterThan(2000);
    expect(allFinite(sim)).toBe(true);
  });

  it('is deterministic for identical inputs', () => {
    const a = makeSim();
    const b = makeSim();
    for (const sim of [a, b]) {
      run(sim, 0.5);
      sim.strike('overhead', 1.2);
      run(sim, 1.5);
    }
    expect(Array.from(a.model.rope.x)).toEqual(Array.from(b.model.rope.x));
    expect(a.detector.count).toBe(b.detector.count);
  });
});

describe('Simulation — crack events', () => {
  const qualities: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];
  const styles: StrikeStyle[] = ['side', 'overhead', 'upward'];

  it.each(qualities)('a default strike cracks at %s quality', (quality) => {
    for (const style of styles) {
      const sim = makeSim({ quality });
      run(sim, 1.5);
      sim.strike(style);
      const events: ReturnType<typeof sim.drainEvents> = [];
      run(sim, 1.5, (s) => events.push(...s.drainEvents()));
      expect(events.length, `${quality}/${style}`).toBeGreaterThanOrEqual(1);
      expect(events.length, `${quality}/${style}`).toBeLessThanOrEqual(3);
      for (const e of events) expect(e.peakSpeed).toBeGreaterThanOrEqual(sim.params.crackSpeed);
    }
  });

  it('a very weak strike produces no crack (sound is physics gated)', () => {
    const sim = makeSim({ force: 0.2 });
    run(sim, 1.5);
    sim.strike('side');
    run(sim, 2);
    expect(sim.detector.count).toBe(0);
    expect(sim.drainEvents()).toHaveLength(0);
  });

  it('does not crack while hanging at rest', () => {
    const sim = makeSim();
    run(sim, 10);
    expect(sim.detector.count).toBe(0);
  });

  it('a drag-and-release gesture launches a strike that cracks', () => {
    const sim = makeSim();
    run(sim, 1);
    sim.pointerDown(0.4, 0.4);
    for (let i = 0; i <= 30; i++) {
      sim.pointerMove(0.4 - i * 0.04, 0.4 - i * 0.005);
      run(sim, 1 / 60);
    }
    expect(sim.phase).toBe('charge');
    expect(sim.charge).toBeGreaterThan(0.9);
    expect(sim.pointerUp(-0.8, 0.25)).toBe(true);
    run(sim, 1.5);
    expect(sim.detector.count).toBeGreaterThanOrEqual(1);
  });

  it('a click without drag does not launch a strike', () => {
    const sim = makeSim();
    sim.pointerDown(0, 0.4);
    run(sim, 0.1);
    expect(sim.pointerUp(0, 0.4)).toBe(false);
    expect(sim.strikeActive).toBe(false);
  });

  it('stays finite under violent, fast pointer motion', () => {
    const sim = makeSim({ quality: 'low', flexibility: 1, damping: 0 });
    let maxTip = 0;
    for (let f = 0; f < 600; f++) {
      sim.pointerMove(f % 2 === 0 ? 3 : -3, f % 3 === 0 ? 2 : -2);
      sim.frame(1 / 60);
      maxTip = Math.max(maxTip, sim.metrics.tipSpeed);
      expect(sim.model.rope.isHealthy()).toBe(true);
    }
    expect(maxTip).toBeLessThanOrEqual(sim.params.maxNodeSpeed + 1e-6);
  });

  it('bounds the pending event queue', () => {
    const sim = makeSim({ force: 2 });
    for (let k = 0; k < 40; k++) {
      sim.strike(k % 2 ? 'upward' : 'overhead', 2);
      run(sim, 0.8);
    }
    expect(sim.drainEvents().length).toBeLessThanOrEqual(16);
  });

  it('pauses without advancing time', () => {
    const sim = makeSim();
    sim.paused = true;
    sim.frame(1 / 60);
    expect(sim.totalSteps).toBe(0);
  });
});

describe('Simulation — phases', () => {
  it('walks through acceleration, propagation, crack and recovery during a strike', () => {
    const sim = makeSim();
    run(sim, 1.5);
    const seen = new Set<string>();
    sim.strike('overhead');
    run(sim, 4, (s) => seen.add(s.phase));
    for (const phase of ['acceleration', 'propagation', 'crack', 'recovery', 'cooldown', 'rest']) {
      expect(seen.has(phase), phase).toBe(true);
    }
  });

  it('reports preparation while the pointer is held without charge', () => {
    const sim = makeSim();
    run(sim, 1);
    sim.pointerDown(-0.6, 0.4);
    run(sim, 0.1);
    expect(sim.phase).toBe('preparation');
  });
});

describe('Modes', () => {
  it('demo mode strikes on its own and yields to the user', () => {
    const sim = makeSim();
    const demo = new DemoDirector(5);
    for (let f = 0; f < 60 * 6; f++) {
      demo.update(1 / 60, sim, 3);
      sim.frame(1 / 60);
    }
    expect(demo.strikes).toBeGreaterThanOrEqual(2);
    expect(sim.detector.count).toBeGreaterThanOrEqual(1);
    demo.notifyUserInput();
    const before = demo.strikes;
    for (let f = 0; f < 60; f++) demo.update(1 / 60, sim, 3);
    expect(demo.strikes).toBe(before);
    expect(demo.userInControl).toBe(true);
  });

  it('training counts hits inside the target', () => {
    const t = new TrainingSession(1);
    t.target = { x: 1, y: 0, radius: 0.5 };
    const base = { time: 0, dirX: 1, dirY: 0, peakSpeed: 50, intensity: 0.6, id: 1 };
    expect(t.register({ ...base, x: 1.2, y: 0.1 }).hit).toBe(true);
    expect(t.register({ ...base, x: 3, y: 3, id: 2 }).hit).toBe(false);
    expect(t.hits).toBe(1);
    expect(t.attempts).toBe(2);
    expect(t.streak).toBe(0);
    expect(t.bestIntensity).toBeCloseTo(0.6);
    for (let i = 0; i < 50; i++) {
      t.nextTarget(0, 0, 2.5, { minX: -4, maxX: 4, minY: -3, maxY: 2 });
      expect(t.target.x - t.target.radius).toBeGreaterThanOrEqual(-4);
      expect(t.target.x + t.target.radius).toBeLessThanOrEqual(4);
      expect(t.target.y - t.target.radius).toBeGreaterThanOrEqual(-3);
      expect(t.target.y + t.target.radius).toBeLessThanOrEqual(2);
    }
  });
});
