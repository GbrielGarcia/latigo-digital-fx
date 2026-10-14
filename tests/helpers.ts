import { Simulation } from '../src/core/simulation';
import {
  DEFAULT_TUNING,
  QUALITY_PRESETS,
  resolveParams,
  type WhipParams,
  type WhipTuning,
} from '../src/core/whip/params';

export function makeParams(overrides: Partial<WhipTuning> = {}): WhipParams {
  const quality = overrides.quality ?? DEFAULT_TUNING.quality;
  return resolveParams({
    ...DEFAULT_TUNING,
    nodeCount: QUALITY_PRESETS[quality].nodeCount,
    ...overrides,
  });
}

export function makeSim(overrides: Partial<WhipTuning> = {}): Simulation {
  return new Simulation(makeParams(overrides), -0.6, 0.4);
}

/** Runs fixed physics steps for `seconds` of simulated time. */
export function run(sim: Simulation, seconds: number, onStep?: (sim: Simulation) => void): void {
  const dt = sim.stepper.stepDt;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    sim.step(dt);
    onStep?.(sim);
  }
}

export function allFinite(sim: Simulation): boolean {
  const r = sim.model.rope;
  for (let i = 0; i < r.nodeCount; i++) {
    if (![r.x[i], r.y[i], r.px[i], r.py[i]].every(Number.isFinite)) return false;
  }
  return true;
}
