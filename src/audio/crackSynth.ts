import { createRng, randRange } from '../core/math/random';

/**
 * Procedural whip-crack synthesis. Produces mono PCM samples in [-1, 1].
 * Pure function (no Web Audio dependency) so it can be unit tested.
 *
 * Layers:
 *  1. A sub-millisecond N-shaped pressure transient (the "shock").
 *  2. A band-passed noise burst with a very fast exponential decay (the snap).
 *  3. A short high-frequency sizzle.
 *  4. A soft low-passed noise tail standing in for room reflections.
 */
export interface CrackVoiceParams {
  /** Seconds. */
  duration: number;
  /** Centre frequency of the snap band-pass (Hz). */
  snapFrequency: number;
  /** Snap decay time constant (s). */
  snapDecay: number;
  /** Tail level relative to the snap (0 – 1). */
  tailLevel: number;
  tailDecay: number;
  sizzleLevel: number;
}

export function randomCrackParams(seed: number): CrackVoiceParams {
  const rng = createRng(seed);
  return {
    duration: randRange(rng, 0.28, 0.4),
    snapFrequency: randRange(rng, 2200, 3600),
    snapDecay: randRange(rng, 0.006, 0.011),
    tailLevel: randRange(rng, 0.12, 0.22),
    tailDecay: randRange(rng, 0.06, 0.11),
    sizzleLevel: randRange(rng, 0.25, 0.45),
  };
}

/** Simple biquad band-pass (RBJ cookbook), processed in place. */
function bandPass(samples: Float32Array, sampleRate: number, freq: number, q: number): void {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    samples[i] = y0;
  }
}

function onePoleLowPass(samples: Float32Array, sampleRate: number, cutoff: number): void {
  const a = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    y = (1 - a) * samples[i] + a * y;
    samples[i] = y;
  }
}

export function synthesizeCrack(
  sampleRate: number,
  params: CrackVoiceParams,
  seed: number,
): Float32Array<ArrayBuffer> {
  const rng = createRng(seed ^ 0x9e3779b9);
  const length = Math.max(1, Math.floor(params.duration * sampleRate));
  const out = new Float32Array(length);

  // 1. N-wave transient: ~0.6 ms positive then negative lobe.
  const nLen = Math.max(4, Math.floor(0.0006 * sampleRate));
  for (let i = 0; i < nLen && i < length; i++) {
    const t = i / nLen;
    out[i] += (1 - 2 * t) * 0.9;
  }

  // 2. Snap: band-passed noise with fast exponential decay.
  const snap = new Float32Array(length);
  for (let i = 0; i < length; i++) snap[i] = rng() * 2 - 1;
  bandPass(snap, sampleRate, params.snapFrequency, 0.9);
  for (let i = 0; i < length; i++) {
    out[i] += snap[i] * 2.4 * Math.exp(-i / sampleRate / params.snapDecay);
  }

  // 3. Sizzle: high-passed noise (noise minus its low-pass), very short.
  const sizzle = new Float32Array(length);
  for (let i = 0; i < length; i++) sizzle[i] = rng() * 2 - 1;
  const low = Float32Array.from(sizzle);
  onePoleLowPass(low, sampleRate, 5000);
  for (let i = 0; i < length; i++) {
    out[i] += (sizzle[i] - low[i]) * params.sizzleLevel * Math.exp(-i / sampleRate / 0.004);
  }

  // 4. Tail: low-passed noise with a slower decay (body / room).
  const tail = new Float32Array(length);
  for (let i = 0; i < length; i++) tail[i] = rng() * 2 - 1;
  onePoleLowPass(tail, sampleRate, 1400);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.004);
    out[i] += tail[i] * params.tailLevel * 3 * attack * Math.exp(-t / params.tailDecay);
  }

  // Normalise to a -1 dBFS peak and fade out the last 5 ms to avoid clicks.
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? 0.89 / peak : 0;
  const fade = Math.min(length, Math.floor(0.005 * sampleRate));
  for (let i = 0; i < length; i++) {
    let s = out[i] * gain;
    const fromEnd = length - 1 - i;
    if (fromEnd < fade) s *= fromEnd / fade;
    out[i] = s;
  }
  return out;
}

/** Seamless-ish loop of soft filtered noise used for the swing "whoosh". */
export function synthesizeWhooshLoop(
  sampleRate: number,
  seconds: number,
  seed: number,
): Float32Array<ArrayBuffer> {
  const rng = createRng(seed);
  const length = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rng() * 2 - 1;
  bandPass(out, sampleRate, 700, 0.7);
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const fade = Math.floor(0.02 * sampleRate);
  for (let i = 0; i < length; i++) {
    let s = out[i] / (peak || 1);
    if (i < fade) s *= i / fade;
    if (length - 1 - i < fade) s *= (length - 1 - i) / fade;
    out[i] = s * 0.8;
  }
  return out;
}
