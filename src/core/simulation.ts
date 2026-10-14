import { clamp } from './math/scalar';
import { FixedStepper, type AdvanceResult } from './physics/fixedStepper';
import { CrackDetector, defaultDetectorOptions, type CrackEvent } from './whip/crackDetector';
import type { WhipParams } from './whip/params';
import { PhaseMachine, type WhipPhase } from './whip/phaseMachine';
import { StrikeDriver, strikeDirection, type StrikeStyle } from './whip/strikeDriver';
import { WhipModel, type WhipMetrics } from './whip/whipModel';

const MAX_PENDING_EVENTS = 16;
const MAX_STEPS_PER_FRAME = 24;
const MAX_FRAME_DELTA = 0.1;
const MIN_RELEASE_CHARGE = 0.12;

/**
 * Headless whip simulation: physics, input intents, strike drivers, crack
 * detection and phase tracking. It has no dependency on the DOM, the renderer
 * or audio, so it can run in tests and benchmarks.
 */
export class Simulation {
  model: WhipModel;
  stepper: FixedStepper;
  detector: CrackDetector;
  phases = new PhaseMachine();
  time = 0;
  totalSteps = 0;
  timeScale = 1;
  paused = false;
  metrics: WhipMetrics = {
    gripSpeed: 0,
    tipSpeed: 0,
    tipVx: 0,
    tipVy: 0,
    kineticEnergy: 0,
    fastestNode: 1,
  };
  normalizedEnergy = 0;
  charge = 0;
  pointerHeld = false;
  /** Previous physics state, for render interpolation. */
  prevX: Float64Array;
  prevY: Float64Array;
  prevGripX = 0;
  prevGripY = 0;
  prevHandleTipX = 0;
  prevHandleTipY = 0;
  droppedEvents = 0;

  private driver: StrikeDriver | null = null;
  private events: CrackEvent[] = [];
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerX = 0;
  private pointerY = 0;
  private pointerHeldTime = 0;
  private crackedThisFrame = false;
  private energyReference = 1;

  constructor(params: WhipParams, gripX = 0, gripY = 0.6) {
    this.model = new WhipModel(params, gripX, gripY);
    this.stepper = this.createStepper(params);
    this.detector = new CrackDetector(defaultDetectorOptions(params.crackSpeed));
    this.prevX = new Float64Array(this.model.rope.nodeCount);
    this.prevY = new Float64Array(this.model.rope.nodeCount);
    this.updateEnergyReference();
    this.snapshot();
  }

  private createStepper(params: WhipParams): FixedStepper {
    return new FixedStepper({
      hz: params.physicsHz,
      maxStepsPerFrame: MAX_STEPS_PER_FRAME,
      maxFrameDelta: MAX_FRAME_DELTA,
    });
  }

  private updateEnergyReference(): void {
    let total = 0;
    const rope = this.model.rope;
    for (let i = 1; i < rope.nodeCount; i++) total += rope.mass[i];
    // Reference: the whole rope moving at 6 m/s.
    this.energyReference = 0.5 * total * 36;
  }

  get params(): WhipParams {
    return this.model.params;
  }

  get phase(): WhipPhase {
    return this.phases.phase;
  }

  get strikeActive(): boolean {
    return this.driver !== null;
  }

  setParams(params: WhipParams): void {
    const hzChanged = params.physicsHz !== this.model.params.physicsHz;
    this.model.setParams(params);
    if (hzChanged) this.stepper = this.createStepper(params);
    this.detector.options = defaultDetectorOptions(params.crackSpeed);
    if (this.prevX.length !== this.model.rope.nodeCount) {
      this.prevX = new Float64Array(this.model.rope.nodeCount);
      this.prevY = new Float64Array(this.model.rope.nodeCount);
    }
    this.updateEnergyReference();
    this.snapshot();
  }

  setBounds(minX: number, maxX: number, minY: number, maxY: number): void {
    this.model.bounds = { minX, maxX, minY, maxY };
  }

  reset(gripX = 0, gripY = 0.6): void {
    this.driver = null;
    this.pointerHeld = false;
    this.charge = 0;
    this.model.reset(gripX, gripY);
    this.detector.reset();
    this.phases.reset();
    this.stepper.reset();
    this.events.length = 0;
    this.snapshot();
  }

  // ---- Input intents (world coordinates) ---------------------------------

  pointerMove(x: number, y: number): void {
    this.pointerX = x;
    this.pointerY = y;
    if (!this.driver) this.model.setTarget(x, y);
  }

  pointerDown(x: number, y: number): void {
    this.pointerHeld = true;
    this.pointerHeldTime = 0;
    this.pointerDownX = x;
    this.pointerDownY = y;
    this.charge = 0;
    this.driver = null;
    this.pointerMove(x, y);
  }

  /** Releases the drag; returns true when it launched a strike. */
  pointerUp(x: number, y: number): boolean {
    if (!this.pointerHeld) return false;
    this.pointerMove(x, y);
    this.pointerHeld = false;
    const charge = this.charge;
    this.charge = 0;
    const dx = this.pointerDownX - x;
    const dy = this.pointerDownY - y;
    if (charge < MIN_RELEASE_CHARGE || Math.hypot(dx, dy) < 1e-3) return false;
    this.driver = new StrikeDriver({
      startX: this.model.gripX,
      startY: this.model.gripY,
      dirX: dx,
      dirY: dy,
      strength: this.params.force * (0.55 + charge * 0.75),
      skipWindup: true,
    });
    return true;
  }

  /** Cancels an in-progress drag (window lost focus, Esc…). */
  cancelPointer(): void {
    this.pointerHeld = false;
    this.charge = 0;
  }

  /** Scripted strike (Space key, button, demo mode). */
  strike(style: StrikeStyle = 'side', strengthMultiplier = 1): void {
    const dir = strikeDirection(style, this.model.gripX);
    this.driver = new StrikeDriver({
      startX: this.model.gripX,
      startY: this.model.gripY,
      dirX: dir.x,
      dirY: dir.y,
      strength: this.params.force * strengthMultiplier,
    });
  }

  // ---- Time stepping -----------------------------------------------------

  frame(frameDelta: number): AdvanceResult {
    this.crackedThisFrame = false;
    if (this.paused) return { steps: 0, alpha: 1, droppedTime: 0 };
    return this.stepper.advance(frameDelta, this.timeScale, (dt) => this.step(dt));
  }

  /** One fixed physics step. Public for deterministic tests. */
  step(dt: number): void {
    this.snapshot();
    let followOverride: number | undefined;
    if (this.driver) {
      const target = this.driver.update(dt);
      if (target) {
        this.model.setTarget(target.x, target.y);
        followOverride = this.driver.followRate;
      } else {
        this.driver = null;
      }
    }
    if (this.pointerHeld) {
      this.pointerHeldTime += dt;
      const dist = Math.hypot(this.pointerX - this.pointerDownX, this.pointerY - this.pointerDownY);
      this.charge = clamp(dist / 0.9, 0, 1) * clamp(this.pointerHeldTime / 0.2, 0, 1);
    }

    this.model.step(dt, followOverride);
    this.time += dt;
    this.totalSteps++;

    const m = this.model.metrics();
    this.metrics = m;
    this.normalizedEnergy = m.kineticEnergy / this.energyReference;
    const rope = this.model.rope;
    const tip = rope.nodeCount - 1;
    const event = this.detector.update(this.time, rope.x[tip], rope.y[tip], m.tipVx, m.tipVy);
    if (event) {
      this.crackedThisFrame = true;
      if (this.events.length >= MAX_PENDING_EVENTS) {
        this.events.shift();
        this.droppedEvents++;
      }
      this.events.push(event);
    }
    this.phases.update({
      dt,
      pointerHeld: this.pointerHeld,
      charge: this.charge,
      gripSpeed: m.gripSpeed,
      tipSpeed: m.tipSpeed,
      energy: this.normalizedEnergy,
      cracked: event !== null,
      refractoryRemaining: this.detector.refractoryRemaining(this.time),
    });
  }

  private snapshot(): void {
    const rope = this.model.rope;
    if (this.prevX.length !== rope.nodeCount) return;
    this.prevX.set(rope.x);
    this.prevY.set(rope.y);
    this.prevGripX = this.model.gripX;
    this.prevGripY = this.model.gripY;
    this.prevHandleTipX = this.model.handleTipX;
    this.prevHandleTipY = this.model.handleTipY;
  }

  get crackedRecently(): boolean {
    return this.crackedThisFrame;
  }

  /** Returns and clears the pending crack events. */
  drainEvents(): CrackEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }
}
