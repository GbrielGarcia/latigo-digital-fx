import { createRng, randRange, type Rng } from '../math/random';
import type { Simulation } from '../simulation';
import type { StrikeStyle } from '../whip/strikeDriver';

const STYLES: StrikeStyle[] = ['side', 'overhead', 'upward'];

/**
 * Autonomous movements for the demo mode. It wanders the grip along a smooth
 * path and periodically launches strikes. Any user input pauses it for a
 * while, so the user can always take over.
 */
export class DemoDirector {
  private rng: Rng;
  private time = 0;
  private nextStrikeAt = 0.8;
  private userIdleFor = Infinity;
  /** Seconds of user inactivity before the demo resumes. */
  readonly resumeDelay = 2.5;
  strikes = 0;

  constructor(seed = 1234) {
    this.rng = createRng(seed);
  }

  notifyUserInput(): void {
    this.userIdleFor = 0;
  }

  get userInControl(): boolean {
    return this.userIdleFor < this.resumeDelay;
  }

  /** Call once per frame with real (unscaled) frame time. */
  update(dt: number, sim: Simulation, halfWidth: number): void {
    this.userIdleFor += dt;
    if (this.userInControl) return;
    this.time += dt;
    if (!sim.strikeActive) {
      const wander = Math.min(halfWidth * 0.45, 1.6);
      const x = Math.sin(this.time * 0.6) * wander;
      const y = 0.5 + Math.sin(this.time * 0.9 + 1.3) * 0.35;
      sim.pointerMove(x, y);
    }
    if (this.time >= this.nextStrikeAt && !sim.strikeActive) {
      const style = STYLES[Math.floor(this.rng() * STYLES.length)];
      sim.strike(style, randRange(this.rng, 0.85, 1.35));
      this.strikes++;
      this.nextStrikeAt = this.time + randRange(this.rng, 1.4, 2.4);
    }
  }
}
