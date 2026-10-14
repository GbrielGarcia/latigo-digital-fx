import { clamp, easeInOutCubic, easeOutQuad } from '../math/scalar';

export type StrikeStyle = 'side' | 'overhead' | 'upward';

export interface StrikePlan {
  /** Grip position where the strike starts. */
  startX: number;
  startY: number;
  /** Unit direction of the forward stroke. */
  dirX: number;
  dirY: number;
  /** Strength multiplier (0.2 – 2). */
  strength: number;
  /** Skip the wind-up (e.g. the user already pulled back with a drag). */
  skipWindup?: boolean;
}

interface Segment {
  duration: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  ease: (t: number) => number;
}

/**
 * Produces a time-parameterised grip trajectory for a strike: wind-up,
 * explosive forward stroke and an abrupt stop. The whip physics turns this
 * hand motion into a travelling loop; the crack (and its sound) only happens
 * if the resulting tip speed crosses the detector threshold.
 */
export class StrikeDriver {
  private segments: Segment[] = [];
  private index = 0;
  private time = 0;
  /** Follow rate the model should use while the driver is active. */
  readonly followRate = 140;

  constructor(plan: StrikePlan) {
    const s = clamp(plan.strength, 0.2, 2);
    const len = Math.hypot(plan.dirX, plan.dirY) || 1;
    const dx = plan.dirX / len;
    const dy = plan.dirY / len;
    const back = 0.55 * Math.sqrt(s);
    const forward = 0.95 * Math.sqrt(s);
    const lift = 0.18;
    let x = plan.startX;
    let y = plan.startY;
    if (!plan.skipWindup) {
      const wx = x - dx * back;
      const wy = y - dy * back + lift;
      this.segments.push({ duration: 0.24, fromX: x, fromY: y, toX: wx, toY: wy, ease: easeOutQuad });
      x = wx;
      y = wy;
    }
    const strokeDuration = clamp(0.2 / Math.sqrt(s), 0.1, 0.36);
    const fx = x + dx * (forward + (plan.skipWindup ? 0 : back));
    const fy = y + dy * (forward + (plan.skipWindup ? 0 : back)) - (plan.skipWindup ? 0 : lift);
    this.segments.push({
      duration: strokeDuration,
      fromX: x,
      fromY: y,
      toX: fx,
      toY: fy,
      ease: easeInOutCubic,
    });
    // Abrupt stop and hold: the energy now travels down the rope.
    this.segments.push({ duration: 0.32, fromX: fx, fromY: fy, toX: fx, toY: fy, ease: (t) => t });
  }

  get finished(): boolean {
    return this.index >= this.segments.length;
  }

  get totalDuration(): number {
    return this.segments.reduce((acc, seg) => acc + seg.duration, 0);
  }

  /** Advances the driver and returns the grip target, or null when done. */
  update(dt: number): { x: number; y: number } | null {
    while (this.index < this.segments.length) {
      const seg = this.segments[this.index];
      if (this.time + dt <= seg.duration) {
        this.time += dt;
        const t = seg.ease(clamp(this.time / seg.duration, 0, 1));
        return { x: seg.fromX + (seg.toX - seg.fromX) * t, y: seg.fromY + (seg.toY - seg.fromY) * t };
      }
      dt -= seg.duration - this.time;
      this.time = 0;
      this.index++;
    }
    return null;
  }
}

/** Unit stroke direction for a style; `side` alternates left/right by grip position. */
export function strikeDirection(style: StrikeStyle, gripX: number): { x: number; y: number } {
  switch (style) {
    case 'overhead':
      return { x: gripX <= 0 ? 0.93 : -0.93, y: -0.37 };
    case 'upward':
      return { x: gripX <= 0 ? 0.7 : -0.7, y: 0.71 };
    default:
      return { x: gripX <= 0 ? 1 : -1, y: 0.05 };
  }
}
