import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/math/random';
import { FrameStats } from '../src/diagnostics/frameStats';
import { Camera } from '../src/render/camera';
import { ImpactEffects, TipTrail } from '../src/render/effects';
import { ParticlePool } from '../src/render/particles';
import { shade } from '../src/render/renderer';
import { sampleCatmullRom, splineCapacity } from '../src/render/spline';
import { formatSettingValue } from '../src/ui/ui';

const event = { time: 0, x: 0, y: 0, dirX: 1, dirY: 0, peakSpeed: 60, intensity: 1, id: 1 };

describe('Particles and effects stay bounded', () => {
  it('never exceeds the pool capacity', () => {
    const pool = new ParticlePool(64);
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) pool.burst(rng, 40, 0, 0, 1, 0, 10);
    expect(pool.alive).toBeLessThanOrEqual(64);
  });

  it('respects the quality limit and expires particles', () => {
    const pool = new ParticlePool(64);
    pool.limit = 10;
    pool.burst(createRng(2), 40, 0, 0, 1, 0, 10);
    expect(pool.alive).toBeLessThanOrEqual(10);
    for (let i = 0; i < 120; i++) pool.update(1 / 60, 6, 2);
    expect(pool.alive).toBe(0);
  });

  it('caps shockwaves and decays flash and shake', () => {
    const fx = new ImpactEffects(128, 3);
    for (let i = 0; i < 50; i++) fx.trigger({ ...event, id: i });
    expect(fx.shockwaves.length).toBeLessThanOrEqual(10);
    expect(fx.flash).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) fx.update(1 / 60);
    expect(fx.shockwaves).toHaveLength(0);
    expect(fx.flash).toBe(0);
    expect(fx.shakeX).toBe(0);
    expect(fx.particles.alive).toBe(0);
  });

  it('honours accessibility switches', () => {
    const fx = new ImpactEffects(128, 4);
    fx.options = { intensity: 1, particles: 1, reduceMotion: false, disableFlash: true, disableShake: true };
    fx.trigger(event);
    fx.update(1 / 60);
    expect(fx.flash).toBe(0);
    expect(fx.shakeX).toBe(0);
    expect(fx.shakeY).toBe(0);
  });

  it('disables everything when intensity is zero', () => {
    const fx = new ImpactEffects(128, 5);
    fx.options = { ...fx.options, intensity: 0 };
    fx.trigger(event);
    expect(fx.shockwaves).toHaveLength(0);
    expect(fx.particles.alive).toBe(0);
  });

  it('keeps a ring buffer for the trail', () => {
    const trail = new TipTrail(8);
    for (let i = 0; i < 20; i++) trail.push(i, 0, i, 1);
    expect(trail.count).toBe(8);
    expect(trail.x[trail.index(0)]).toBe(19);
    expect(trail.x[trail.index(7)]).toBe(12);
  });
});

describe('Spline and camera', () => {
  it('passes through the control points', () => {
    const xs = [0, 1, 2, 3];
    const ys = [0, 1, 0, 1];
    const cap = splineCapacity(4, 4);
    const ox = new Float32Array(cap);
    const oy = new Float32Array(cap);
    const n = sampleCatmullRom(xs, ys, 4, 4, ox, oy);
    expect(n).toBe(cap);
    for (let i = 0; i < 4; i++) {
      const k = Math.min(i * 4, n - 1);
      expect(ox[k]).toBeCloseTo(xs[i], 5);
      expect(oy[k]).toBeCloseTo(ys[i], 5);
    }
  });

  it('maps world and screen coordinates both ways', () => {
    const cam = new Camera();
    cam.resize(1200, 800, 2, 2.5);
    for (const [x, y] of [
      [0, 0],
      [1.3, -0.7],
      [-2, 1.5],
    ]) {
      expect(cam.toWorldX(cam.sx(x))).toBeCloseTo(x, 9);
      expect(cam.toWorldY(cam.sy(y))).toBeCloseTo(y, 9);
    }
    expect(cam.sy(1)).toBeLessThan(cam.sy(0)); // y up
    expect(cam.dpr).toBe(2);
  });
});

describe('Diagnostics and formatting', () => {
  it('computes FPS and ignores pauses', () => {
    const stats = new FrameStats(60);
    for (let i = 0; i < 60; i++) stats.record(1 / 60, 4, 0);
    stats.record(5, 24, 0);
    expect(stats.fps).toBeCloseTo(60, 5);
    expect(stats.pauses).toBe(1);
  });

  it('formats UI values in Spanish conventions', () => {
    expect(formatSettingValue('length', 2.2)).toBe('2.20 m');
    expect(formatSettingValue('volume', 0.8)).toBe('80 %');
    expect(formatSettingValue('nodeCount', 31.7)).toBe('32');
    expect(formatSettingValue('force', 1)).toBe('1.00×');
  });

  it('shades colours', () => {
    expect(shade('#000000', 1)).toBe('rgb(255,255,255)');
    expect(shade('#808080', -1)).toBe('rgb(0,0,0)');
    expect(shade('not-a-colour', 0.5)).toBe('not-a-colour');
  });
});
