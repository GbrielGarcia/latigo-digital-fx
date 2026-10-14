/**
 * Uniform Catmull-Rom sampling of a polyline. Writes into the provided output
 * arrays (no allocation per frame) and returns the number of samples written.
 */
export function sampleCatmullRom(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  count: number,
  subdivisions: number,
  outX: Float32Array,
  outY: Float32Array,
): number {
  if (count < 2) return 0;
  const sub = Math.max(1, Math.floor(subdivisions));
  let k = 0;
  const cap = outX.length;
  for (let i = 0; i < count - 1; i++) {
    const i0 = Math.max(0, i - 1);
    const i2 = i + 1;
    const i3 = Math.min(count - 1, i + 2);
    const p0x = xs[i0];
    const p0y = ys[i0];
    const p1x = xs[i];
    const p1y = ys[i];
    const p2x = xs[i2];
    const p2y = ys[i2];
    const p3x = xs[i3];
    const p3y = ys[i3];
    for (let s = 0; s < sub; s++) {
      if (k >= cap) return k;
      const t = s / sub;
      const t2 = t * t;
      const t3 = t2 * t;
      outX[k] =
        0.5 *
        (2 * p1x +
          (-p0x + p2x) * t +
          (2 * p0x - 5 * p1x + 4 * p2x - p3x) * t2 +
          (-p0x + 3 * p1x - 3 * p2x + p3x) * t3);
      outY[k] =
        0.5 *
        (2 * p1y +
          (-p0y + p2y) * t +
          (2 * p0y - 5 * p1y + 4 * p2y - p3y) * t2 +
          (-p0y + 3 * p1y - 3 * p2y + p3y) * t3);
      k++;
    }
  }
  if (k < cap) {
    outX[k] = xs[count - 1];
    outY[k] = ys[count - 1];
    k++;
  }
  return k;
}

export function splineCapacity(count: number, subdivisions: number): number {
  return Math.max(0, count - 1) * Math.max(1, Math.floor(subdivisions)) + 1;
}
