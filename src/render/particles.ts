import type { Rng } from '../core/math/random';

/**
 * Fixed-capacity particle pool (struct of arrays). Spawning when full recycles
 * the oldest slot, so memory use is constant and bounded.
 */
export class ParticlePool {
  readonly capacity: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly size: Float32Array;
  private cursor = 0;
  /** Effective limit (≤ capacity), driven by quality settings. */
  limit: number;

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.limit = this.capacity;
    this.x = new Float32Array(this.capacity);
    this.y = new Float32Array(this.capacity);
    this.vx = new Float32Array(this.capacity);
    this.vy = new Float32Array(this.capacity);
    this.life = new Float32Array(this.capacity);
    this.maxLife = new Float32Array(this.capacity);
    this.size = new Float32Array(this.capacity);
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    const limit = Math.max(1, Math.min(this.limit, this.capacity));
    const i = this.cursor % limit;
    this.cursor = (i + 1) % limit;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
  }

  /** Emits a cone-shaped burst of sparks around direction (dx, dy). */
  burst(
    rng: Rng,
    count: number,
    x: number,
    y: number,
    dx: number,
    dy: number,
    speed: number,
    spread = 1.4,
  ): void {
    const base = Math.atan2(dy, dx);
    for (let n = 0; n < count; n++) {
      const a = base + (rng() - 0.5) * spread * 2;
      const s = speed * (0.3 + rng() * 0.9);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + rng() * 0.45, 0.6 + rng() * 1.6);
    }
  }

  update(dt: number, gravity: number, drag: number): void {
    const k = Math.exp(-drag * dt);
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vx[i] *= k;
      this.vy[i] = this.vy[i] * k - gravity * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
  }

  get alive(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.life[i] > 0) n++;
    return n;
  }

  clear(): void {
    this.life.fill(0);
    this.cursor = 0;
  }
}
