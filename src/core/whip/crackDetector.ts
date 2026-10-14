import { clamp } from '../math/scalar';

export interface CrackEvent {
  /** Simulation time of the event (s). */
  time: number;
  x: number;
  y: number;
  /** Direction of travel of the tip at the peak (unit vector). */
  dirX: number;
  dirY: number;
  peakSpeed: number;
  /** Normalised strength in [0, 1]. */
  intensity: number;
  /** Monotonic event id. */
  id: number;
}

export interface CrackDetectorOptions {
  /** Speed (m/s) the tip must exceed to start a candidate crack. */
  highSpeed: number;
  /** Speed (m/s) the tip must fall below before another crack can arm (hysteresis). */
  lowSpeed: number;
  /** Minimum time (s) between two cracks. */
  refractory: number;
  /** A peak is confirmed once speed falls below peak * this factor. */
  peakDropRatio: number;
}

export function defaultDetectorOptions(crackSpeed: number): CrackDetectorOptions {
  return {
    highSpeed: crackSpeed,
    lowSpeed: crackSpeed * 0.35,
    refractory: 0.22,
    peakDropRatio: 0.8,
  };
}

/**
 * Detects crack events from the tip speed signal using hysteresis, peak
 * detection and a refractory period, so that one physical crack produces
 * exactly one event regardless of frame or physics rate.
 */
export class CrackDetector {
  options: CrackDetectorOptions;
  private armed = true;
  private inPeak = false;
  private peakSpeed = 0;
  private peakX = 0;
  private peakY = 0;
  private peakVx = 0;
  private peakVy = 0;
  private lastFireTime = Number.NEGATIVE_INFINITY;
  private nextId = 1;
  count = 0;

  constructor(options: CrackDetectorOptions) {
    this.options = options;
  }

  reset(): void {
    this.armed = true;
    this.inPeak = false;
    this.peakSpeed = 0;
    this.lastFireTime = Number.NEGATIVE_INFINITY;
  }

  get isArmed(): boolean {
    return this.armed;
  }

  refractoryRemaining(time: number): number {
    return Math.max(0, this.options.refractory - (time - this.lastFireTime));
  }

  update(time: number, x: number, y: number, vx: number, vy: number): CrackEvent | null {
    const speed = Math.hypot(vx, vy);
    if (!Number.isFinite(speed)) return null;
    const o = this.options;

    if (!this.armed) {
      if (speed < o.lowSpeed) this.armed = true;
      return null;
    }

    if (!this.inPeak) {
      if (speed > o.highSpeed) {
        this.inPeak = true;
        this.capture(speed, x, y, vx, vy);
      }
      return null;
    }

    if (speed > this.peakSpeed) {
      this.capture(speed, x, y, vx, vy);
      return null;
    }

    if (speed < this.peakSpeed * o.peakDropRatio || speed < o.highSpeed) {
      this.inPeak = false;
      this.armed = false;
      if (time - this.lastFireTime < o.refractory) return null;
      this.lastFireTime = time;
      this.count++;
      const len = this.peakSpeed || 1;
      return {
        time,
        x: this.peakX,
        y: this.peakY,
        dirX: this.peakVx / len,
        dirY: this.peakVy / len,
        peakSpeed: this.peakSpeed,
        intensity: clamp((this.peakSpeed - o.highSpeed) / (o.highSpeed * 1.5) + 0.25, 0, 1),
        id: this.nextId++,
      };
    }
    return null;
  }

  private capture(speed: number, x: number, y: number, vx: number, vy: number): void {
    this.peakSpeed = speed;
    this.peakX = x;
    this.peakY = y;
    this.peakVx = vx;
    this.peakVy = vy;
  }
}
