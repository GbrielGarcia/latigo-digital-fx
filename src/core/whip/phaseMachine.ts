/**
 * Whip phases derived from the live state of the model (not from a canned
 * animation). Labels are in Spanish because they are shown in the UI.
 */
export type WhipPhase =
  'rest' | 'preparation' | 'charge' | 'acceleration' | 'propagation' | 'crack' | 'recovery' | 'cooldown';

export const PHASE_LABELS: Readonly<Record<WhipPhase, string>> = {
  rest: 'Reposo',
  preparation: 'Preparación',
  charge: 'Carga',
  acceleration: 'Aceleración',
  propagation: 'Propagación',
  crack: 'Chasquido',
  recovery: 'Recuperación',
  cooldown: 'Enfriamiento',
};

export interface PhaseInput {
  dt: number;
  pointerHeld: boolean;
  /** Charge accumulated while dragging, 0 – 1. */
  charge: number;
  gripSpeed: number;
  tipSpeed: number;
  /** Rope kinetic energy normalised by a reference energy. */
  energy: number;
  cracked: boolean;
  refractoryRemaining: number;
}

export interface PhaseThresholds {
  /** Grip speed (m/s) considered an active stroke. */
  strokeSpeed: number;
  /** Normalised energy below which the whip is considered settled. */
  restEnergy: number;
  crackHold: number;
}

export const DEFAULT_PHASE_THRESHOLDS: PhaseThresholds = {
  strokeSpeed: 3.2,
  restEnergy: 0.02,
  crackHold: 0.07,
};

export class PhaseMachine {
  phase: WhipPhase = 'rest';
  timeInPhase = 0;
  thresholds: PhaseThresholds;
  private peakTipSinceStroke = 0;

  constructor(thresholds: PhaseThresholds = DEFAULT_PHASE_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  reset(): void {
    this.set('rest');
  }

  private set(next: WhipPhase): void {
    if (next !== this.phase) {
      this.phase = next;
      this.timeInPhase = 0;
      if (next === 'acceleration') this.peakTipSinceStroke = 0;
    }
  }

  update(input: PhaseInput): WhipPhase {
    const t = this.thresholds;
    this.timeInPhase += input.dt;
    const moving = input.gripSpeed > t.strokeSpeed;
    const settled = input.energy < t.restEnergy && input.gripSpeed < t.strokeSpeed * 0.3;

    if (input.cracked) {
      this.set('crack');
      return this.phase;
    }
    // While the user is dragging, the hand is preparing the stroke.
    if (input.pointerHeld && (this.phase !== 'crack' || this.timeInPhase >= t.crackHold)) {
      this.set(this.idlePhase(input));
      return this.phase;
    }

    switch (this.phase) {
      case 'crack':
        if (this.timeInPhase >= t.crackHold) this.set('recovery');
        break;
      case 'acceleration':
        this.peakTipSinceStroke = Math.max(this.peakTipSinceStroke, input.tipSpeed);
        if (!moving || input.tipSpeed > input.gripSpeed * 2) this.set('propagation');
        break;
      case 'propagation':
        if (moving && input.tipSpeed < input.gripSpeed) this.set('acceleration');
        else if (this.timeInPhase > 0.6 || input.energy < t.restEnergy * 4) this.set('recovery');
        break;
      case 'recovery':
        if (moving && this.timeInPhase > 0.1) this.set('acceleration');
        else if (input.energy < t.restEnergy * 3 || this.timeInPhase > 1.2) this.set('cooldown');
        break;
      case 'cooldown':
        if (moving) this.set('acceleration');
        else if (input.refractoryRemaining <= 0 && settled) this.set(this.idlePhase(input));
        else if (input.refractoryRemaining <= 0 && this.timeInPhase > 0.8) this.set(this.idlePhase(input));
        break;
      default: {
        // rest / preparation / charge
        if (moving) this.set('acceleration');
        else this.set(this.idlePhase(input));
      }
    }
    return this.phase;
  }

  private idlePhase(input: PhaseInput): WhipPhase {
    if (input.pointerHeld) return input.charge >= 0.3 ? 'charge' : 'preparation';
    return 'rest';
  }
}
