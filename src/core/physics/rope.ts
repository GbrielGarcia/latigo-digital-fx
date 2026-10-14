import { clamp } from '../math/scalar';

/**
 * Position-based rope: Verlet integration plus iterative distance constraints.
 *
 * Node 0 is kinematic (infinite mass) and is driven by the handle. Masses taper
 * towards the tip so that, when the constraints redistribute momentum, lighter
 * nodes near the tip move faster — the qualitative mechanism behind a whip's
 * tip acceleration. Units are SI-like (metres, seconds, kilograms).
 */
export interface RopeOptions {
  nodeCount: number;
  segmentLength: number;
  /** Mass of the node closest to the handle. */
  baseMass: number;
  /** 0 = uniform mass, 1 = very light tip. */
  taper: number;
}

export interface RopeStepOptions {
  gravity: number;
  /** Linear air damping in 1/s. */
  dampingPerSecond: number;
  /** Hard cap for node speed in m/s; prevents numeric explosions. */
  maxSpeed: number;
}

export interface RopeSolveOptions {
  iterations: number;
  /** Bending stiffness in [0, 1] at the handle end; it fades towards the tip. */
  bendStiffness: number;
}

export const MIN_NODES = 4;
export const MAX_NODES = 128;

export class Rope {
  readonly nodeCount: number;
  readonly segmentLength: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly mass: Float64Array;
  readonly invMass: Float64Array;

  constructor(options: RopeOptions) {
    const n = clamp(Math.round(options.nodeCount), MIN_NODES, MAX_NODES);
    if (!(options.segmentLength > 0)) {
      throw new RangeError('segmentLength must be positive');
    }
    this.nodeCount = n;
    this.segmentLength = options.segmentLength;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.px = new Float64Array(n);
    this.py = new Float64Array(n);
    this.mass = new Float64Array(n);
    this.invMass = new Float64Array(n);
    const taper = clamp(options.taper, 0, 0.95);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const m = options.baseMass * Math.pow(1 - taper * t, 2);
      this.mass[i] = m;
      this.invMass[i] = i === 0 ? 0 : 1 / m;
    }
  }

  get length(): number {
    return this.segmentLength * (this.nodeCount - 1);
  }

  /** Lays the rope out in a straight line starting at (ax, ay) along (dx, dy). */
  layoutStraight(ax: number, ay: number, dx: number, dy: number): void {
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    for (let i = 0; i < this.nodeCount; i++) {
      const px = ax + ux * this.segmentLength * i;
      const py = ay + uy * this.segmentLength * i;
      this.x[i] = px;
      this.y[i] = py;
      this.px[i] = px;
      this.py[i] = py;
    }
  }

  /** Copies positions from another polyline, resampled to this rope's node count. */
  layoutFromPolyline(xs: ArrayLike<number>, ys: ArrayLike<number>): void {
    const count = xs.length;
    if (count < 2) return;
    for (let i = 0; i < this.nodeCount; i++) {
      const f = (i / (this.nodeCount - 1)) * (count - 1);
      const i0 = Math.min(Math.floor(f), count - 2);
      const t = f - i0;
      const nx = xs[i0] + (xs[i0 + 1] - xs[i0]) * t;
      const ny = ys[i0] + (ys[i0 + 1] - ys[i0]) * t;
      this.x[i] = nx;
      this.y[i] = ny;
      this.px[i] = nx;
      this.py[i] = ny;
    }
  }

  /** Verlet integration of every free node. */
  integrate(dt: number, options: RopeStepOptions): void {
    const damping = Math.exp(-Math.max(0, options.dampingPerSecond) * dt);
    const maxStep = options.maxSpeed * dt;
    const maxStepSq = maxStep * maxStep;
    const gy = -options.gravity * dt * dt;
    for (let i = 1; i < this.nodeCount; i++) {
      let vx = (this.x[i] - this.px[i]) * damping;
      let vy = (this.y[i] - this.py[i]) * damping;
      const sq = vx * vx + vy * vy;
      if (sq > maxStepSq) {
        const s = maxStep / Math.sqrt(sq);
        vx *= s;
        vy *= s;
      }
      this.px[i] = this.x[i];
      this.py[i] = this.y[i];
      this.x[i] += vx;
      this.y[i] += vy + gy;
    }
  }

  /** Pins node 0 to the handle tip, keeping a consistent previous position. */
  setAnchor(x: number, y: number, prevX: number, prevY: number): void {
    this.x[0] = x;
    this.y[0] = y;
    this.px[0] = prevX;
    this.py[0] = prevY;
  }

  /** Iterative constraint resolution (distance + compression-only bending). */
  solve(options: RopeSolveOptions): void {
    const n = this.nodeCount;
    const rest = this.segmentLength;
    const bendRest = rest * 2 * 0.985;
    const iterations = Math.max(1, Math.round(options.iterations));
    // Convert the desired overall stiffness into a per-iteration factor so
    // the result does not depend on the iteration count.
    const target = clamp(options.bendStiffness, 0, 0.99);
    const perIter = 1 - Math.pow(1 - target, 1 / iterations);
    const { x, y, invMass } = this;

    for (let k = 0; k < iterations; k++) {
      for (let i = 0; i < n - 1; i++) {
        const j = i + 1;
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-9) continue;
        const wi = invMass[i];
        const wj = invMass[j];
        const w = wi + wj;
        if (w === 0) continue;
        const diff = (d - rest) / (d * w);
        x[i] += dx * diff * wi;
        y[i] += dy * diff * wi;
        x[j] -= dx * diff * wj;
        y[j] -= dy * diff * wj;
      }
      if (perIter > 0) {
        for (let i = 0; i < n - 2; i++) {
          const j = i + 2;
          const dx = x[j] - x[i];
          const dy = y[j] - y[i];
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d >= bendRest || d < 1e-9) continue;
          const wi = invMass[i];
          const wj = invMass[j];
          const w = wi + wj;
          if (w === 0) continue;
          // Stiffness fades towards the tip, like a tapered braided whip.
          const fade = 1 - 0.75 * (i / (n - 2));
          const diff = ((d - bendRest) / (d * w)) * perIter * fade;
          x[i] += dx * diff * wi;
          y[i] += dy * diff * wi;
          x[j] -= dx * diff * wj;
          y[j] -= dy * diff * wj;
        }
      }
    }
  }

  nodeSpeed(i: number, dt: number): number {
    return Math.hypot(this.x[i] - this.px[i], this.y[i] - this.py[i]) / dt;
  }

  /** Kinetic energy of the free nodes (J, given the mass units). */
  kineticEnergy(dt: number): number {
    let e = 0;
    for (let i = 1; i < this.nodeCount; i++) {
      const vx = (this.x[i] - this.px[i]) / dt;
      const vy = (this.y[i] - this.py[i]) / dt;
      e += 0.5 * this.mass[i] * (vx * vx + vy * vy);
    }
    return e;
  }

  /** True when every coordinate is finite and inside a sane bounding radius. */
  isHealthy(maxRadius = 1e4): boolean {
    for (let i = 0; i < this.nodeCount; i++) {
      const a = this.x[i];
      const b = this.y[i];
      const c = this.px[i];
      const d = this.py[i];
      if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) {
        return false;
      }
      if (Math.abs(a) > maxRadius || Math.abs(b) > maxRadius) return false;
    }
    return true;
  }
}
