// Headless physics benchmark: measures real wall-clock cost of physics steps
// on this machine for every quality preset. Prints measured values only.
import { Simulation } from '../src/core/simulation';
import { QUALITY_PRESETS, resolveParams, DEFAULT_TUNING, type QualityLevel } from '../src/core/whip/params';

const SECONDS = 20;

for (const quality of Object.keys(QUALITY_PRESETS) as QualityLevel[]) {
  const preset = QUALITY_PRESETS[quality];
  const params = resolveParams({ ...DEFAULT_TUNING, quality, nodeCount: preset.nodeCount });
  const sim = new Simulation(params, -0.6, 0.4);
  const steps = params.physicsHz * SECONDS;
  const dt = 1 / params.physicsHz;
  const start = process.hrtime.bigint();
  for (let i = 0; i < steps; i++) {
    if (i % Math.round(params.physicsHz * 1.5) === 0) sim.strike(i % 2 ? 'side' : 'overhead');
    sim.step(dt);
  }
  const ns = Number(process.hrtime.bigint() - start);
  const perStepUs = ns / steps / 1000;
  const perFrameMs = (perStepUs * params.physicsHz) / 60 / 1000;
  console.log(
    `${quality.padEnd(6)} nodes=${String(params.nodeCount).padStart(2)} hz=${params.physicsHz} ` +
      `iter=${params.iterations} → ${perStepUs.toFixed(2)} µs/step, ` +
      `${perFrameMs.toFixed(3)} ms of physics per 60 FPS frame, cracks=${sim.detector.count}, ` +
      `healthy=${sim.model.rope.isHealthy()}`,
  );
}
