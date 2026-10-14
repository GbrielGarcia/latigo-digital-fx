/**
 * Fixed-timestep accumulator ("fix your timestep"). Decouples the physics rate
 * from the render rate, caps the work done per frame and recovers gracefully
 * from pauses (minimised window, debugger breakpoints, slow frames).
 */
export interface StepperOptions {
  /** Physics rate in Hz. */
  hz: number;
  /** Maximum physics steps executed per frame. */
  maxStepsPerFrame: number;
  /** Frame deltas larger than this (s) are treated as a pause and clamped. */
  maxFrameDelta: number;
}

export interface AdvanceResult {
  steps: number;
  /** Interpolation factor in [0, 1) between the last two physics states. */
  alpha: number;
  /** Simulated time that was dropped because of the per-frame cap. */
  droppedTime: number;
}

export class FixedStepper {
  readonly stepDt: number;
  readonly maxStepsPerFrame: number;
  readonly maxFrameDelta: number;
  private accumulator = 0;
  totalDroppedTime = 0;

  constructor(options: StepperOptions) {
    if (!(options.hz > 0)) throw new RangeError('hz must be positive');
    this.stepDt = 1 / options.hz;
    this.maxStepsPerFrame = Math.max(1, Math.floor(options.maxStepsPerFrame));
    this.maxFrameDelta = Math.max(this.stepDt, options.maxFrameDelta);
  }

  advance(frameDelta: number, timeScale: number, step: (dt: number) => void): AdvanceResult {
    let dt = Number.isFinite(frameDelta) && frameDelta > 0 ? frameDelta : 0;
    if (dt > this.maxFrameDelta) dt = this.maxFrameDelta;
    const scale = Number.isFinite(timeScale) && timeScale > 0 ? timeScale : 0;
    this.accumulator += dt * scale;

    let steps = 0;
    while (this.accumulator >= this.stepDt && steps < this.maxStepsPerFrame) {
      step(this.stepDt);
      this.accumulator -= this.stepDt;
      steps++;
    }

    let droppedTime = 0;
    if (this.accumulator >= this.stepDt) {
      // Spiral-of-death protection: drop the backlog, keep the remainder.
      const remainder = this.accumulator % this.stepDt;
      droppedTime = this.accumulator - remainder;
      this.accumulator = remainder;
      this.totalDroppedTime += droppedTime;
    }
    return { steps, alpha: this.accumulator / this.stepDt, droppedTime };
  }

  reset(): void {
    this.accumulator = 0;
  }
}
