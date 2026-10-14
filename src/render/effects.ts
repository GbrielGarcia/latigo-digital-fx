import { createRng, type Rng } from '../core/math/random';
import { clamp } from '../core/math/scalar';
import type { CrackEvent } from '../core/whip/crackDetector';
import { ParticlePool } from './particles';

export interface EffectOptions {
  /** Global intensity 0 – 1. */
  intensity: number;
  /** Particle amount 0 – 1. */
  particles: number;
  reduceMotion: boolean;
  disableFlash: boolean;
  disableShake: boolean;
}

export interface Shockwave {
  x: number;
  y: number;
  age: number;
  life: number;
  strength: number;
}

const MAX_SHOCKWAVES = 10;

/**
 * Time-limited impact effects: shockwave rings, a screen flash, camera shake
 * and spark particles. Every effect decays on its own and every buffer is
 * bounded. All of them can be reduced or disabled for accessibility.
 */
export class ImpactEffects {
  readonly particles: ParticlePool;
  readonly shockwaves: Shockwave[] = [];
  flash = 0;
  shakeX = 0;
  shakeY = 0;
  private shakeEnergy = 0;
  private shakeTime = 0;
  private rng: Rng;
  options: EffectOptions = {
    intensity: 0.8,
    particles: 0.7,
    reduceMotion: false,
    disableFlash: false,
    disableShake: false,
  };

  constructor(maxParticles = 512, seed = 99) {
    this.particles = new ParticlePool(maxParticles);
    this.rng = createRng(seed);
  }

  trigger(event: CrackEvent): void {
    const o = this.options;
    const k = clamp(o.intensity, 0, 1) * (0.4 + 0.6 * event.intensity);
    if (k <= 0) return;
    const motion = o.reduceMotion ? 0.35 : 1;

    if (this.shockwaves.length >= MAX_SHOCKWAVES) this.shockwaves.shift();
    this.shockwaves.push({ x: event.x, y: event.y, age: 0, life: 0.35 + 0.25 * k, strength: k });

    if (!o.disableFlash && !o.reduceMotion) this.flash = Math.min(0.5, this.flash + 0.28 * k);
    if (!o.disableShake && !o.reduceMotion) this.shakeEnergy = Math.min(1, this.shakeEnergy + 0.55 * k);

    const count = Math.round(40 * clamp(o.particles, 0, 1) * k * motion);
    if (count > 0) {
      this.particles.burst(this.rng, count, event.x, event.y, event.dirX, event.dirY, 6 + 10 * k, 1.2);
      // A few sparks flying backwards for a fuller burst.
      this.particles.burst(
        this.rng,
        Math.ceil(count / 4),
        event.x,
        event.y,
        -event.dirX,
        -event.dirY,
        3 + 4 * k,
        1.6,
      );
    }
  }

  update(dt: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.age += dt;
      if (s.age >= s.life) this.shockwaves.splice(i, 1);
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.shakeEnergy = Math.max(0, this.shakeEnergy - dt * 4.5);
    this.shakeTime += dt;
    const amp = this.shakeEnergy * this.shakeEnergy * 9;
    this.shakeX = amp > 0 ? Math.sin(this.shakeTime * 91) * amp : 0;
    this.shakeY = amp > 0 ? Math.cos(this.shakeTime * 73) * amp : 0;
    this.particles.update(dt, 6, 2.2);
  }

  clear(): void {
    this.shockwaves.length = 0;
    this.flash = 0;
    this.shakeEnergy = 0;
    this.shakeX = this.shakeY = 0;
    this.particles.clear();
  }
}

/** Ring buffer of recent tip positions for the motion trail. */
export class TipTrail {
  readonly capacity: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly t: Float32Array;
  readonly speed: Float32Array;
  private head = 0;
  count = 0;

  constructor(capacity = 64) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.t = new Float32Array(capacity);
    this.speed = new Float32Array(capacity);
  }

  push(x: number, y: number, time: number, speed: number): void {
    this.x[this.head] = x;
    this.y[this.head] = y;
    this.t[this.head] = time;
    this.speed[this.head] = speed;
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /** Index of the i-th most recent sample (0 = newest). */
  index(i: number): number {
    return (this.head - 1 - i + this.capacity * 2) % this.capacity;
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
  }
}
