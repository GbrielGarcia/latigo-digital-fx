export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing factor for a rate in 1/s. */
export function smoothingFactor(ratePerSecond: number, dt: number): number {
  return 1 - Math.exp(-ratePerSecond * dt);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
