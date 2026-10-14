import { clamp, smoothingFactor } from '../math/scalar';
import { Rope } from '../physics/rope';
import type { WhipParams } from './params';

/** Rest orientation of the handle (world space, y up): mostly upwards. */
const REST_DIR_X = 0.28;
const REST_DIR_Y = 1;
const DIR_FOLLOW_RATE = 22;
const VELOCITY_SMOOTHING_RATE = 30;

export interface WhipMetrics {
  gripSpeed: number;
  tipSpeed: number;
  tipVx: number;
  tipVy: number;
  kineticEnergy: number;
  /** Index of the fastest free node — used to observe wave propagation. */
  fastestNode: number;
}

/**
 * The whip: a kinematic handle (grip + rigid stick) driving a flexible rope.
 * The grip follows a target point (pointer or scripted driver) with
 * exponential smoothing; the stick tilts with the grip velocity, which acts
 * like a wrist flick and injects the wave that travels down the rope.
 */
export class WhipModel {
  params: WhipParams;
  rope: Rope;
  gripX = 0;
  gripY = 0;
  targetX = 0;
  targetY = 0;
  gripVx = 0;
  gripVy = 0;
  dirX = 0;
  dirY = 1;
  tipAnchorX = 0;
  tipAnchorY = 0;
  /** Bounds for the grip (world units); updated by the host view. */
  bounds = { minX: -10, maxX: 10, minY: -10, maxY: 10 };
  private lastDt = 1 / 240;
  recoveries = 0;

  constructor(params: WhipParams, gripX = 0, gripY = 0) {
    this.params = params;
    this.rope = this.createRope(params);
    this.reset(gripX, gripY);
  }

  private createRope(params: WhipParams): Rope {
    return new Rope({
      nodeCount: params.nodeCount,
      segmentLength: params.length / (params.nodeCount - 1),
      baseMass: params.baseMass,
      taper: params.taper,
    });
  }

  /** Puts the whip at rest, hanging from the handle at the given grip point. */
  reset(gripX: number, gripY: number): void {
    this.gripX = this.targetX = gripX;
    this.gripY = this.targetY = gripY;
    this.gripVx = this.gripVy = 0;
    const len = Math.hypot(REST_DIR_X, REST_DIR_Y);
    this.dirX = REST_DIR_X / len;
    this.dirY = REST_DIR_Y / len;
    this.updateAnchor();
    // Hang slightly forward so gravity produces a natural curve quickly.
    this.rope.layoutStraight(this.tipAnchorX, this.tipAnchorY, 0.25, -1);
  }

  /** Applies new parameters; rebuilds the rope when the topology changes. */
  setParams(params: WhipParams): void {
    const old = this.params;
    this.params = params;
    if (old.nodeCount !== params.nodeCount || Math.abs(old.length - params.length) > 1e-9) {
      const prev = this.rope;
      const next = this.createRope(params);
      // Keep the current shape (scaled to the new length) to avoid popping.
      const scale = params.length / prev.length;
      const xs = new Float64Array(prev.nodeCount);
      const ys = new Float64Array(prev.nodeCount);
      for (let i = 0; i < prev.nodeCount; i++) {
        xs[i] = prev.x[0] + (prev.x[i] - prev.x[0]) * scale;
        ys[i] = prev.y[0] + (prev.y[i] - prev.y[0]) * scale;
      }
      next.layoutFromPolyline(xs, ys);
      this.rope = next;
    }
  }

  setTarget(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.targetX = clamp(x, this.bounds.minX, this.bounds.maxX);
    this.targetY = clamp(y, this.bounds.minY, this.bounds.maxY);
  }

  get handleTipX(): number {
    return this.tipAnchorX;
  }

  get handleTipY(): number {
    return this.tipAnchorY;
  }

  private updateAnchor(): void {
    this.tipAnchorX = this.gripX + this.dirX * this.params.handleLength;
    this.tipAnchorY = this.gripY + this.dirY * this.params.handleLength;
  }

  step(dt: number, followRateOverride?: number): void {
    const p = this.params;
    this.lastDt = dt;
    const prevTipX = this.tipAnchorX;
    const prevTipY = this.tipAnchorY;

    // Grip follows the target with smoothing and a speed limit.
    const follow = smoothingFactor(followRateOverride ?? p.gripFollowRate, dt);
    let mx = (this.targetX - this.gripX) * follow;
    let my = (this.targetY - this.gripY) * follow;
    const maxMove = p.maxGripSpeed * dt;
    const move = Math.hypot(mx, my);
    if (move > maxMove) {
      mx *= maxMove / move;
      my *= maxMove / move;
    }
    this.gripX += mx;
    this.gripY += my;
    const velBlend = smoothingFactor(VELOCITY_SMOOTHING_RATE, dt);
    this.gripVx += (mx / dt - this.gripVx) * velBlend;
    this.gripVy += (my / dt - this.gripVy) * velBlend;

    // Wrist tilt: the handle leans with the grip velocity.
    let tx = REST_DIR_X + this.gripVx * p.handleTilt;
    let ty = REST_DIR_Y + this.gripVy * p.handleTilt;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const dirBlend = smoothingFactor(DIR_FOLLOW_RATE, dt);
    let dx = this.dirX + (tx - this.dirX) * dirBlend;
    let dy = this.dirY + (ty - this.dirY) * dirBlend;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    this.dirX = dx;
    this.dirY = dy;
    this.updateAnchor();

    const rope = this.rope;
    rope.integrate(dt, {
      gravity: p.gravity,
      dampingPerSecond: p.dampingPerSecond,
      maxSpeed: p.maxNodeSpeed,
    });
    rope.setAnchor(this.tipAnchorX, this.tipAnchorY, prevTipX, prevTipY);
    rope.solve({ iterations: p.iterations, bendStiffness: p.bendStiffness });

    if (!rope.isHealthy()) {
      // Never propagate NaN/Infinity: rebuild a resting rope at the handle.
      this.recoveries++;
      if (!Number.isFinite(this.gripX) || !Number.isFinite(this.gripY)) {
        this.gripX = this.targetX = 0;
        this.gripY = this.targetY = 0;
      }
      this.reset(this.gripX, this.gripY);
    }
  }

  metrics(): WhipMetrics {
    const dt = this.lastDt;
    const rope = this.rope;
    const tip = rope.nodeCount - 1;
    const tipVx = (rope.x[tip] - rope.px[tip]) / dt;
    const tipVy = (rope.y[tip] - rope.py[tip]) / dt;
    let fastest = 1;
    let fastestSpeed = -1;
    for (let i = 1; i < rope.nodeCount; i++) {
      const s = rope.nodeSpeed(i, dt);
      if (s > fastestSpeed) {
        fastestSpeed = s;
        fastest = i;
      }
    }
    return {
      gripSpeed: Math.hypot(this.gripVx, this.gripVy),
      tipSpeed: Math.hypot(tipVx, tipVy),
      tipVx,
      tipVy,
      kineticEnergy: rope.kineticEnergy(dt),
      fastestNode: fastest,
    };
  }
}
