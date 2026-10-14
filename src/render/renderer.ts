import type { BackgroundStyle } from '../config/settings';
import type { TrainingTarget } from '../core/modes/trainingSession';
import type { Simulation } from '../core/simulation';
import { Camera } from './camera';
import type { ImpactEffects, TipTrail } from './effects';
import { sampleCatmullRom, splineCapacity } from './spline';
import type { Theme } from './themes';

export interface RenderOptions {
  theme: Theme;
  background: BackgroundStyle;
  handleColor: string;
  ropeColor: string;
  thickness: number;
  /** Trail strength 0 – 1 (0 hides it). */
  trail: number;
  subdivisions: number;
  labOverlay: boolean;
  target: TrainingTarget | null;
  /** Real time in seconds, for subtle animations. */
  time: number;
}

/**
 * Canvas 2D renderer. Draws an interpolated view of the physics state, so the
 * picture stays smooth at any refresh rate, and scales for HiDPI displays.
 */
export class Renderer {
  readonly camera = new Camera();
  private ctx: CanvasRenderingContext2D;
  private nodeX = new Float64Array(0);
  private nodeY = new Float64Array(0);
  private splineX = new Float32Array(0);
  private splineY = new Float32Array(0);
  private leftX = new Float32Array(0);
  private leftY = new Float32Array(0);
  private rightX = new Float32Array(0);
  private rightY = new Float32Array(0);
  private bgCache: { key: string; canvas: HTMLCanvasElement | null } = { key: '', canvas: null };

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('Canvas 2D no disponible');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number, reach: number): void {
    this.camera.resize(cssWidth, cssHeight, dpr, reach);
    const w = Math.max(1, Math.round(cssWidth * this.camera.dpr));
    const h = Math.max(1, Math.round(cssHeight * this.camera.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.bgCache.key = '';
  }

  private ensureBuffers(nodes: number, subdivisions: number): void {
    if (this.nodeX.length !== nodes) {
      this.nodeX = new Float64Array(nodes);
      this.nodeY = new Float64Array(nodes);
    }
    const cap = splineCapacity(nodes, subdivisions);
    if (this.splineX.length !== cap) {
      this.splineX = new Float32Array(cap);
      this.splineY = new Float32Array(cap);
      this.leftX = new Float32Array(cap);
      this.leftY = new Float32Array(cap);
      this.rightX = new Float32Array(cap);
      this.rightY = new Float32Array(cap);
    }
  }

  draw(sim: Simulation, alpha: number, effects: ImpactEffects, trail: TipTrail, o: RenderOptions): void {
    const ctx = this.ctx;
    const cam = this.camera;
    cam.shakeX = effects.shakeX;
    cam.shakeY = effects.shakeY;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    this.drawBackground(o);
    if (o.target) this.drawTarget(o.target, o);

    // Interpolate the rope between the last two physics states.
    const rope = sim.model.rope;
    const n = rope.nodeCount;
    this.ensureBuffers(n, o.subdivisions);
    const a = Math.max(0, Math.min(1, alpha));
    for (let i = 0; i < n; i++) {
      this.nodeX[i] = sim.prevX[i] + (rope.x[i] - sim.prevX[i]) * a;
      this.nodeY[i] = sim.prevY[i] + (rope.y[i] - sim.prevY[i]) * a;
    }
    const gripX = sim.prevGripX + (sim.model.gripX - sim.prevGripX) * a;
    const gripY = sim.prevGripY + (sim.model.gripY - sim.prevGripY) * a;
    const hTipX = sim.prevHandleTipX + (sim.model.handleTipX - sim.prevHandleTipX) * a;
    const hTipY = sim.prevHandleTipY + (sim.model.handleTipY - sim.prevHandleTipY) * a;

    const count = sampleCatmullRom(this.nodeX, this.nodeY, n, o.subdivisions, this.splineX, this.splineY);
    for (let i = 0; i < count; i++) {
      this.splineX[i] = cam.sx(this.splineX[i]);
      this.splineY[i] = cam.sy(this.splineY[i]);
    }

    if (o.trail > 0) this.drawTrail(trail, o);
    this.drawRope(count, o, true);
    this.drawRope(count, o, false);
    this.drawPopper(count, o);
    this.drawHandle(gripX, gripY, hTipX, hTipY, o);
    if (o.labOverlay) this.drawLab(sim, o);
    this.drawEffects(effects, o);
  }

  private drawBackground(o: RenderOptions): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const w = cam.cssWidth;
    const h = cam.cssHeight;
    const key = `${o.theme.id}|${o.background}|${w}x${h}@${cam.dpr}|${cam.pxPerMeter.toFixed(2)}`;
    if (this.bgCache.key !== key) {
      this.bgCache.key = key;
      this.bgCache.canvas = this.renderBackground(o, w, h);
    }
    if (this.bgCache.canvas) {
      ctx.drawImage(this.bgCache.canvas, 0, 0, w, h);
    } else {
      ctx.fillStyle = o.theme.bgSolid;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private renderBackground(o: RenderOptions, w: number, h: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const cam = this.camera;
    const c = document.createElement('canvas');
    c.width = Math.round(w * cam.dpr);
    c.height = Math.round(h * cam.dpr);
    const g = c.getContext('2d');
    if (!g) return null;
    g.scale(cam.dpr, cam.dpr);
    const t = o.theme;
    if (o.background === 'solid') {
      g.fillStyle = t.bgSolid;
    } else {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, t.bgTop);
      grad.addColorStop(1, t.bgBottom);
      g.fillStyle = grad;
    }
    g.fillRect(0, 0, w, h);
    if (o.background === 'grid') {
      g.strokeStyle = t.grid;
      g.lineWidth = 1;
      const step = cam.pxPerMeter * 0.5;
      const ox = (w / 2) % step;
      const oy = (h / 2) % step;
      g.beginPath();
      for (let x = ox; x < w; x += step) {
        g.moveTo(Math.round(x) + 0.5, 0);
        g.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = oy; y < h; y += step) {
        g.moveTo(0, Math.round(y) + 0.5);
        g.lineTo(w, Math.round(y) + 0.5);
      }
      g.stroke();
    }
    // Floor hint and vignette for depth.
    const floorY = h * 0.5 + cam.pxPerMeter * 2.2;
    if (floorY < h) {
      const fg = g.createLinearGradient(0, floorY, 0, h);
      fg.addColorStop(0, 'rgba(0,0,0,0)');
      fg.addColorStop(1, t.vignette);
      g.fillStyle = fg;
      g.fillRect(0, floorY, w, h - floorY);
    }
    const vg = g.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.35,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.75,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, t.vignette);
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    return c;
  }

  private ropeWidth(t: number, o: RenderOptions): number {
    const scale = (this.camera.pxPerMeter / 140) * o.thickness;
    return Math.max(1.1, (9 * Math.pow(1 - t, 0.9) + 1.4) * scale);
  }

  private drawRope(count: number, o: RenderOptions, shadow: boolean): void {
    if (count < 2) return;
    const ctx = this.ctx;
    const X = this.splineX;
    const Y = this.splineY;
    const shadowOffset = shadow ? Math.max(3, this.camera.pxPerMeter * 0.05) : 0;
    for (let i = 0; i < count; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(count - 1, i + 1);
      let nx = -(Y[i1] - Y[i0]);
      let ny = X[i1] - X[i0];
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      const half = this.ropeWidth(i / (count - 1), o) / 2;
      this.leftX[i] = X[i] + nx * half;
      this.leftY[i] = Y[i] + ny * half + shadowOffset;
      this.rightX[i] = X[i] - nx * half;
      this.rightY[i] = Y[i] - ny * half + shadowOffset;
    }
    ctx.beginPath();
    ctx.moveTo(this.leftX[0], this.leftY[0]);
    for (let i = 1; i < count; i++) ctx.lineTo(this.leftX[i], this.leftY[i]);
    for (let i = count - 1; i >= 0; i--) ctx.lineTo(this.rightX[i], this.rightY[i]);
    ctx.closePath();
    const theme = o.theme;
    if (shadow) {
      if (theme.ropeShadow.endsWith(',0.0)')) return;
      ctx.fillStyle = theme.ropeShadow;
      ctx.fill();
      return;
    }
    const color = o.ropeColor || theme.rope;
    if (theme.glow > 0) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = theme.glow;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
    // Specular highlight along the upper edge for a rounded look.
    ctx.beginPath();
    ctx.moveTo((X[0] + this.leftX[0]) / 2, (Y[0] + this.leftY[0]) / 2);
    for (let i = 1; i < count; i++)
      ctx.lineTo((X[i] * 2 + this.leftX[i]) / 3, (Y[i] * 2 + this.leftY[i]) / 3);
    ctx.strokeStyle = theme.ropeHighlight;
    ctx.lineWidth = Math.max(0.8, this.ropeWidth(0.3, o) * 0.18);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    // Braided texture: subtle cross ticks on the thicker part.
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const limit = Math.floor(count * 0.6);
    for (let i = 2; i < limit; i += 2) {
      ctx.moveTo(this.leftX[i], this.leftY[i]);
      ctx.lineTo(this.rightX[i - 1], this.rightY[i - 1]);
    }
    ctx.stroke();
  }

  private drawPopper(count: number, o: RenderOptions): void {
    if (count < 2) return;
    const ctx = this.ctx;
    const x = this.splineX[count - 1];
    const y = this.splineY[count - 1];
    const px = this.splineX[count - 2];
    const py = this.splineY[count - 2];
    const ang = Math.atan2(y - py, x - px);
    const len = Math.max(6, this.camera.pxPerMeter * 0.09) * o.thickness;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = o.theme.tip;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) {
      ctx.moveTo(0, 0);
      ctx.lineTo(len, k * len * 0.12);
    }
    ctx.stroke();
    ctx.fillStyle = o.theme.tip;
    ctx.beginPath();
    ctx.arc(0, 0, 1.8 * o.thickness, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawHandle(gx: number, gy: number, tx: number, ty: number, o: RenderOptions): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const x0 = cam.sx(gx);
    const y0 = cam.sy(gy);
    const x1 = cam.sx(tx);
    const y1 = cam.sy(ty);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const width = Math.max(6, cam.pxPerMeter * 0.075) * Math.sqrt(o.thickness);
    const color = o.handleColor || o.theme.handle;
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(ang);
    const grad = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
    grad.addColorStop(0, shade(color, 0.35));
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, shade(color, -0.45));
    ctx.fillStyle = grad;
    roundRect(ctx, -width * 0.3, -width / 2, len + width * 0.3, width, width * 0.45);
    ctx.fill();
    // Grip wrap lines.
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let s = width * 0.4; s < len * 0.75; s += width * 0.45) {
      ctx.moveTo(s, -width / 2 + 1);
      ctx.lineTo(s + width * 0.3, width / 2 - 1);
    }
    ctx.stroke();
    // Ferrule at the tip and pommel at the grip.
    ctx.fillStyle = o.theme.handleAccent;
    roundRect(ctx, len - width * 0.35, -width * 0.58, width * 0.5, width * 1.16, width * 0.2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-width * 0.3, 0, width * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawTrail(trail: TipTrail, o: RenderOptions): void {
    if (trail.count < 2) return;
    const ctx = this.ctx;
    const cam = this.camera;
    const maxAge = 0.06 + 0.3 * o.trail;
    const newest = trail.t[trail.index(0)];
    ctx.save();
    if (o.theme.additiveEffects) ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < trail.count - 1; i++) {
      const a = trail.index(i);
      const b = trail.index(i + 1);
      const age = newest - trail.t[b];
      if (age > maxAge) break;
      const speed = Math.min(1, trail.speed[a] / 60);
      if (speed < 0.05) continue;
      const fade = 1 - age / maxAge;
      ctx.strokeStyle = `rgba(${o.theme.trail},${(fade * speed * 0.7 * o.trail).toFixed(3)})`;
      ctx.lineWidth = 1 + 5 * fade * speed;
      ctx.beginPath();
      ctx.moveTo(cam.sx(trail.x[a]), cam.sy(trail.y[a]));
      ctx.lineTo(cam.sx(trail.x[b]), cam.sy(trail.y[b]));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTarget(target: TrainingTarget, o: RenderOptions): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const x = cam.sx(target.x);
    const y = cam.sy(target.y);
    const r = target.radius * cam.pxPerMeter;
    const pulse = 0.5 + 0.5 * Math.sin(o.time * 3);
    ctx.save();
    ctx.strokeStyle = `rgba(${o.theme.target},${0.55 + 0.25 * pulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(${o.theme.target},0.10)`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${o.theme.target},0.9)`;
    ctx.fill();
    ctx.restore();
  }

  private drawLab(sim: Simulation, o: RenderOptions): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const rope = sim.model.rope;
    const dt = sim.stepper.stepDt;
    const crack = sim.params.crackSpeed;
    for (let i = 1; i < rope.nodeCount; i++) {
      const s = Math.min(1, rope.nodeSpeed(i, dt) / crack);
      ctx.fillStyle = `hsl(${(1 - s) * 200}, 90%, ${o.theme.id === 'light' ? 40 : 60}%)`;
      ctx.beginPath();
      ctx.arc(cam.sx(this.nodeX[i]), cam.sy(this.nodeY[i]), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawEffects(effects: ImpactEffects, o: RenderOptions): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const theme = o.theme;
    ctx.save();
    if (theme.additiveEffects) ctx.globalCompositeOperation = 'lighter';
    for (const s of effects.shockwaves) {
      const t = s.age / s.life;
      const r = (0.08 + 0.9 * Math.sqrt(t)) * cam.pxPerMeter * (0.6 + 0.6 * s.strength);
      ctx.strokeStyle = `rgba(${theme.shock},${((1 - t) * 0.8 * s.strength).toFixed(3)})`;
      ctx.lineWidth = 1 + 4 * (1 - t);
      ctx.beginPath();
      ctx.arc(cam.sx(s.x), cam.sy(s.y), r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const p = effects.particles;
    ctx.fillStyle = `rgb(${theme.spark})`;
    for (let i = 0; i < p.capacity; i++) {
      if (p.life[i] <= 0) continue;
      const life = p.life[i] / p.maxLife[i];
      ctx.globalAlpha = life;
      const size = p.size[i] * (0.6 + life);
      ctx.fillRect(cam.sx(p.x[i]) - size / 2, cam.sy(p.y[i]) - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (effects.flash > 0.001) {
      ctx.fillStyle = `rgba(${theme.flash},${effects.flash.toFixed(3)})`;
      ctx.fillRect(0, 0, cam.cssWidth, cam.cssHeight);
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Lightens (amount > 0) or darkens (amount < 0) a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.round(Math.max(0, Math.min(255, v)));
  });
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}
