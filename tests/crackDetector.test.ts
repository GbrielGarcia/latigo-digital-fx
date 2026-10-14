import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/math/random';
import { CrackDetector, defaultDetectorOptions } from '../src/core/whip/crackDetector';

function feed(detector: CrackDetector, speeds: number[], hz = 240, t0 = 0) {
  const events = [];
  for (let i = 0; i < speeds.length; i++) {
    const e = detector.update(t0 + i / hz, i * 0.01, 0, speeds[i], 0);
    if (e) events.push(e);
  }
  return events;
}

/** A smooth bell-shaped speed pulse peaking at `peak`. */
function pulse(peak: number, samples = 60): number[] {
  return Array.from(
    { length: samples },
    (_, i) => peak * Math.exp(-(((i - samples / 2) / (samples / 8)) ** 2)),
  );
}

describe('CrackDetector', () => {
  it('emits exactly one event per speed peak above the threshold', () => {
    const d = new CrackDetector(defaultDetectorOptions(30));
    const events = feed(d, pulse(60));
    expect(events).toHaveLength(1);
    expect(events[0].peakSpeed).toBeCloseTo(60, 0);
    expect(events[0].intensity).toBeGreaterThan(0);
    expect(events[0].intensity).toBeLessThanOrEqual(1);
    expect(events[0].dirX).toBeCloseTo(1, 6);
  });

  it('does not fire below the threshold', () => {
    const d = new CrackDetector(defaultDetectorOptions(30));
    expect(feed(d, pulse(29))).toHaveLength(0);
  });

  it('does not repeat while the speed jitters around the threshold (hysteresis)', () => {
    const d = new CrackDetector(defaultDetectorOptions(30));
    const rng = createRng(7);
    const signal = Array.from({ length: 480 }, () => 30 + (rng() - 0.5) * 8); // 26–34 m/s for 2 s
    expect(feed(d, signal).length).toBeLessThanOrEqual(1);
  });

  it('respects the refractory period between two close peaks', () => {
    const opts = { ...defaultDetectorOptions(30), refractory: 0.5 };
    const d = new CrackDetector(opts);
    const signal = [...pulse(60, 40), ...pulse(60, 40)]; // two peaks ~0.17 s apart
    expect(feed(d, signal)).toHaveLength(1);
  });

  it('fires again for a second, well separated stroke', () => {
    const d = new CrackDetector(defaultDetectorOptions(30));
    const signal = [...pulse(60), ...new Array(120).fill(0), ...pulse(70)];
    const events = feed(d, signal);
    expect(events).toHaveLength(2);
    expect(events[1].id).toBe(events[0].id + 1);
  });

  it('ignores non-finite samples', () => {
    const d = new CrackDetector(defaultDetectorOptions(30));
    expect(d.update(0, 0, 0, Number.NaN, 0)).toBeNull();
    expect(d.update(0.01, 0, 0, Number.POSITIVE_INFINITY, 0)).toBeNull();
    expect(feed(d, pulse(50), 240, 1)).toHaveLength(1);
  });

  it('reports remaining refractory time and resets', () => {
    const d = new CrackDetector(defaultDetectorOptions(30));
    feed(d, pulse(60));
    expect(d.count).toBe(1);
    d.reset();
    expect(d.isArmed).toBe(true);
    expect(d.refractoryRemaining(100)).toBe(0);
  });
});
