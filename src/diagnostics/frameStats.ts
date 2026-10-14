/**
 * Rolling frame statistics for the lab mode and the performance profile.
 * Uses a fixed-size ring buffer (no unbounded growth).
 */
export class FrameStats {
  private readonly samples: Float64Array;
  private head = 0;
  private count = 0;
  stepsLastFrame = 0;
  droppedTime = 0;
  longFrames = 0;
  pauses = 0;
  /** Frames longer than this are pauses (hidden window), not rendering cost. */
  static readonly PAUSE_THRESHOLD = 0.25;

  constructor(capacity = 120) {
    this.samples = new Float64Array(capacity);
  }

  record(frameSeconds: number, steps: number, dropped: number): void {
    if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) return;
    if (frameSeconds > FrameStats.PAUSE_THRESHOLD) {
      this.pauses++;
      return;
    }
    this.samples[this.head] = frameSeconds;
    this.head = (this.head + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
    this.stepsLastFrame = steps;
    this.droppedTime += dropped;
    if (frameSeconds > 1 / 30) this.longFrames++;
  }

  get averageFrameTime(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += this.samples[i];
    return sum / this.count;
  }

  get fps(): number {
    const avg = this.averageFrameTime;
    return avg > 0 ? 1 / avg : 0;
  }

  /** Worst frame time in the window (s). */
  get worstFrameTime(): number {
    let worst = 0;
    for (let i = 0; i < this.count; i++) worst = Math.max(worst, this.samples[i]);
    return worst;
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
    this.droppedTime = 0;
    this.longFrames = 0;
    this.pauses = 0;
  }
}
