import { createRng, randRange, type Rng } from '../math/random';
import type { CrackEvent } from '../whip/crackDetector';

export interface TrainingTarget {
  x: number;
  y: number;
  radius: number;
}

export interface TargetBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface TrainingResult {
  hit: boolean;
  distance: number;
}

/**
 * Training mode: a target appears in reach of the whip; cracks that happen
 * inside it count as hits. Tracks attempts, hits, streak and best intensity.
 */
export class TrainingSession {
  target: TrainingTarget;
  attempts = 0;
  hits = 0;
  streak = 0;
  bestIntensity = 0;
  private rng: Rng;

  constructor(seed = 42) {
    this.rng = createRng(seed);
    this.target = { x: 1.2, y: 0.4, radius: 0.45 };
  }

  /** Places a new target within reach of the grip and inside the given bounds. */
  nextTarget(gripX: number, gripY: number, reach: number, bounds: TargetBounds): void {
    const angle = randRange(this.rng, -Math.PI * 0.85, Math.PI * 0.85) + (gripX > 0 ? Math.PI : 0);
    const dist = randRange(this.rng, reach * 0.65, reach * 0.95);
    const radius = Math.max(0.3, 0.55 - this.hits * 0.01);
    const clampTo = (v: number, min: number, max: number) =>
      min > max ? (min + max) / 2 : Math.max(min, Math.min(max, v));
    this.target = {
      x: clampTo(gripX + Math.cos(angle) * dist, bounds.minX + radius, bounds.maxX - radius),
      y: clampTo(gripY + Math.sin(angle) * dist, bounds.minY + radius, bounds.maxY - radius),
      radius,
    };
  }

  register(event: CrackEvent): TrainingResult {
    this.attempts++;
    const distance = Math.hypot(event.x - this.target.x, event.y - this.target.y);
    const hit = distance <= this.target.radius;
    if (hit) {
      this.hits++;
      this.streak++;
      this.bestIntensity = Math.max(this.bestIntensity, event.intensity);
    } else {
      this.streak = 0;
    }
    return { hit, distance };
  }

  reset(): void {
    this.attempts = 0;
    this.hits = 0;
    this.streak = 0;
    this.bestIntensity = 0;
  }
}
