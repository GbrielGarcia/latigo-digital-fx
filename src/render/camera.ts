/**
 * Maps world coordinates (metres, y up, origin at the view centre) to CSS
 * pixels and back. Device pixel ratio is handled by the renderer transform.
 */
export class Camera {
  cssWidth = 1;
  cssHeight = 1;
  dpr = 1;
  pxPerMeter = 100;
  shakeX = 0;
  shakeY = 0;

  /**
   * `fixedPxPerMeter` (desktop overlay) sets the whip scale explicitly instead
   * of fitting the whole reach into the view.
   */
  resize(cssWidth: number, cssHeight: number, dpr: number, reach: number, fixedPxPerMeter = 0): void {
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.dpr = Math.max(0.5, Math.min(4, dpr || 1));
    if (fixedPxPerMeter > 0) {
      this.pxPerMeter = Math.max(10, fixedPxPerMeter);
      return;
    }
    const halfHeight = Math.max(2.4, reach * 1.2);
    const byHeight = this.cssHeight / (2 * halfHeight);
    const byWidth = this.cssWidth / (2 * reach * 1.25);
    this.pxPerMeter = Math.max(10, Math.min(byHeight, byWidth));
  }

  get halfWidth(): number {
    return this.cssWidth / 2 / this.pxPerMeter;
  }

  get halfHeight(): number {
    return this.cssHeight / 2 / this.pxPerMeter;
  }

  sx(x: number): number {
    return this.cssWidth / 2 + x * this.pxPerMeter + this.shakeX;
  }

  sy(y: number): number {
    return this.cssHeight / 2 - y * this.pxPerMeter + this.shakeY;
  }

  toWorldX(sx: number): number {
    return (sx - this.cssWidth / 2) / this.pxPerMeter;
  }

  toWorldY(sy: number): number {
    return (this.cssHeight / 2 - sy) / this.pxPerMeter;
  }
}
