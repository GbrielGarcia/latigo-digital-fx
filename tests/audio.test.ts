import { describe, expect, it } from 'vitest';
import { randomCrackParams, synthesizeCrack, synthesizeWhooshLoop } from '../src/audio/crackSynth';
import { SoundGate } from '../src/audio/soundGate';

describe('SoundGate — duplicate prevention', () => {
  it('plays an event only once', () => {
    const gate = new SoundGate();
    expect(gate.tryAcquire(1, 10)).toBe(true);
    expect(gate.tryAcquire(1.5, 10)).toBe(false);
    expect(gate.rejected).toBe(1);
  });

  it('rejects events closer than the minimum interval', () => {
    const gate = new SoundGate({ minInterval: 0.1, maxVoices: 8, voiceDuration: 0.4 });
    expect(gate.tryAcquire(1, 1)).toBe(true);
    expect(gate.tryAcquire(1.05, 2)).toBe(false);
    expect(gate.tryAcquire(1.11, 3)).toBe(true);
  });

  it('bounds the number of simultaneous voices', () => {
    const gate = new SoundGate({ minInterval: 0, maxVoices: 3, voiceDuration: 1 });
    const results = [1, 2, 3, 4, 5].map((id) => gate.tryAcquire(id * 0.01, id));
    expect(results).toEqual([true, true, true, false, false]);
    expect(gate.activeVoices).toBe(3);
    // Voices expire, freeing slots.
    expect(gate.tryAcquire(2, 6)).toBe(true);
    expect(gate.activeVoices).toBe(1);
  });

  it('can be reset', () => {
    const gate = new SoundGate();
    gate.tryAcquire(0, 1);
    gate.reset();
    expect(gate.activeVoices).toBe(0);
    expect(gate.tryAcquire(0, 1)).toBe(true);
  });
});

describe('Crack synthesis', () => {
  const rate = 48_000;

  it('produces finite, normalised samples', () => {
    const data = synthesizeCrack(rate, randomCrackParams(1), 1);
    let peak = 0;
    for (const s of data) {
      expect(Number.isFinite(s)).toBe(true);
      peak = Math.max(peak, Math.abs(s));
    }
    expect(peak).toBeGreaterThan(0.8);
    expect(peak).toBeLessThanOrEqual(0.9);
  });

  it('has a sharp attack: the peak is within the first 3 ms', () => {
    const data = synthesizeCrack(rate, randomCrackParams(2), 2);
    let peakIndex = 0;
    for (let i = 0; i < data.length; i++) if (Math.abs(data[i]) > Math.abs(data[peakIndex])) peakIndex = i;
    expect(peakIndex / rate).toBeLessThan(0.003);
  });

  it('decays: the last 50 ms are much quieter than the first 20 ms', () => {
    const data = synthesizeCrack(rate, randomCrackParams(3), 3);
    const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    const head = rms(data.subarray(0, rate * 0.02));
    const tail = rms(data.subarray(data.length - rate * 0.05));
    expect(tail).toBeLessThan(head * 0.1);
    expect(data[data.length - 1]).toBeCloseTo(0, 6);
  });

  it('is deterministic per seed and varies across seeds', () => {
    const a = synthesizeCrack(rate, randomCrackParams(4), 4);
    const b = synthesizeCrack(rate, randomCrackParams(4), 4);
    const c = synthesizeCrack(rate, randomCrackParams(5), 5);
    expect(Array.from(a.subarray(0, 500))).toEqual(Array.from(b.subarray(0, 500)));
    expect(Array.from(a.subarray(0, 500))).not.toEqual(Array.from(c.subarray(0, 500)));
  });

  it('builds a bounded whoosh loop', () => {
    const loop = synthesizeWhooshLoop(rate, 1, 9);
    expect(loop.length).toBe(rate);
    expect(Math.max(...Array.from(loop, Math.abs))).toBeLessThanOrEqual(0.8 + 1e-6);
  });
});
