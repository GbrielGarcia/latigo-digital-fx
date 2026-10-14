import { AudioEngine } from '../audio/audioEngine';
import { paramsFromSettings } from '../config/physicsFromSettings';
import { parseSettings, type Settings } from '../config/settings';
import { Simulation } from '../core/simulation';
import type { CrackEvent } from '../core/whip/crackDetector';
import { QUALITY_PRESETS } from '../core/whip/params';
import type { OverlayCommand } from '../desktop/protocol';
import { InputController } from '../input/inputController';
import { ImpactEffects, TipTrail } from '../render/effects';
import { Renderer } from '../render/renderer';
import { getTheme } from '../render/themes';
import type { DesktopBridge } from '../shared/bridge';

/**
 * Renderer of the transparent desktop overlay. It reuses the very same
 * Simulation, Renderer (in transparent mode), ImpactEffects and AudioEngine as
 * the main window. The global cursor arrives from the main process already
 * converted to overlay-local CSS pixels; strikes are requested from the
 * physics and the sound is played only for physics crack events.
 */
export class OverlayApp {
  settings: Settings;
  readonly sim: Simulation;
  readonly renderer: Renderer;
  readonly effects = new ImpactEffects(QUALITY_PRESETS.ultra.maxParticles, 7);
  readonly trail = new TipTrail(96);
  readonly audio = new AudioEngine();
  paused = false;
  interactive = false;
  cracks = 0;
  sounds = 0;
  private lastFrame = 0;
  private realTime = 0;
  private drewPausedFrame = false;
  private hasCursor = false;
  private readonly input: InputController;

  constructor(
    canvas: HTMLCanvasElement,
    settings: Settings,
    private readonly bridge: DesktopBridge,
    private readonly banner: HTMLElement,
  ) {
    this.settings = settings;
    this.sim = new Simulation(paramsFromSettings(settings));
    this.renderer = new Renderer(canvas, true);
    this.resize();
    const cam = this.renderer.camera;
    this.sim.reset(0, -cam.halfHeight * 0.2);

    // Only used in interactive mode (click-through off): the OS delivers no
    // pointer events to this window while clicks pass through.
    this.input = new InputController(canvas, {
      pointerMove: (x, y) => this.moveTo(x, y),
      pointerDown: (x, y) => this.sim.pointerDown(cam.toWorldX(x), cam.toWorldY(y)),
      pointerUp: (x, y) => this.sim.pointerUp(cam.toWorldX(x), cam.toWorldY(y)),
      pointerCancel: () => this.sim.cancelPointer(),
      strike: () => this.strike(),
      reset: () => this.resetWhip(),
      togglePause: () => bridge.desktopAction('pause'),
      toggleMute: () => bridge.desktopAction('mute'),
      toggleHelp: () => undefined,
      toggleLab: () => undefined,
      toggleFullscreen: () => undefined,
      togglePanels: () => undefined,
      escape: () => bridge.desktopAction('clickThrough'),
      userActivity: () => undefined,
    });

    bridge.onCursor((x, y) => this.moveTo(x, y));
    bridge.onOverlayCommand((cmd) => this.command(cmd));
    bridge.onSettingsChanged((text) => this.applySettings(parseSettings(text).settings));
    window.addEventListener('resize', () => this.resize());
    this.applySettings(settings);
    this.audio.init();
    this.audio.resume();
  }

  private whipReach(): number {
    const p = this.sim.params;
    return p.length + p.handleLength;
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ppm = (h * this.settings.desktop.whipSize) / this.whipReach();
    this.renderer.resize(w, h, window.devicePixelRatio || 1, this.whipReach(), ppm);
    const cam = this.renderer.camera;
    this.sim.setBounds(-cam.halfWidth, cam.halfWidth, -cam.halfHeight, cam.halfHeight);
    this.drewPausedFrame = false;
  }

  private moveTo(x: number, y: number): void {
    const cam = this.renderer.camera;
    const wx = cam.toWorldX(x);
    const wy = cam.toWorldY(y);
    if (!this.hasCursor) {
      // First sample: place the whip at the cursor instead of flinging it across the screen.
      this.hasCursor = true;
      this.sim.reset(wx, wy);
      this.trail.clear();
    }
    this.sim.pointerMove(wx, wy);
  }

  applySettings(s: Settings): void {
    const reachBefore = this.whipReach();
    const sizeBefore = this.settings.desktop.whipSize;
    this.settings = s;
    this.sim.setParams(paramsFromSettings(s));
    if (reachBefore !== this.whipReach() || sizeBefore !== s.desktop.whipSize) this.resize();
    this.audio.setVolume(s.volume);
    this.audio.setMuted(s.muted || !s.desktop.sound);
    this.effects.options = {
      intensity: s.effectsIntensity,
      particles: s.particles,
      reduceMotion: s.accessibility.reduceMotion,
      disableFlash: s.accessibility.disableFlash,
      disableShake: s.accessibility.disableShake,
    };
    this.effects.particles.limit = QUALITY_PRESETS[s.quality].maxParticles;
    this.drewPausedFrame = false;
  }

  get muted(): boolean {
    return this.settings.muted || !this.settings.desktop.sound;
  }

  strike(): void {
    if (this.paused) return;
    this.sim.strike(this.settings.strikeStyle);
  }

  resetWhip(): void {
    const m = this.sim.model;
    this.sim.reset(m.gripX, m.gripY);
    this.effects.clear();
    this.trail.clear();
    this.audio.gate.reset();
    this.drewPausedFrame = false;
  }

  command(cmd: OverlayCommand): void {
    switch (cmd.type) {
      case 'strike':
        this.strike();
        break;
      case 'reset':
        this.resetWhip();
        break;
      case 'pause':
        this.paused = cmd.paused;
        this.sim.paused = cmd.paused;
        if (cmd.paused) {
          this.sim.cancelPointer();
          this.audio.setSwing(0);
        }
        this.drewPausedFrame = false;
        this.lastFrame = performance.now();
        break;
      case 'interactive':
        this.interactive = cmd.on;
        this.banner.hidden = !cmd.on;
        if (!cmd.on) this.sim.cancelPointer();
        break;
      case 'display': {
        // Moved to another monitor: restart the whip under the cursor.
        this.resize();
        this.hasCursor = false;
        this.moveTo(cmd.cursorX, cmd.cursorY);
        this.effects.clear();
        break;
      }
      case 'status':
        this.bridge.reportOverlay({
          type: 'status',
          steps: this.sim.totalSteps,
          cracks: this.cracks,
          sounds: this.sounds,
          paused: this.paused,
          muted: this.muted,
          audioStatus: this.audio.status,
          transparent: this.renderer.transparent,
          width: this.renderer.camera.cssWidth,
          height: this.renderer.camera.cssHeight,
        });
        break;
    }
  }

  start(): void {
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      this.frame(now);
    };
    requestAnimationFrame(loop);
    this.bridge.reportOverlay({ type: 'ready' });
  }

  private frame(now: number): void {
    const frameDt = Math.max(0, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.paused) {
      // Paused: draw the frozen whip once, then do no work at all.
      if (this.drewPausedFrame) return;
      this.drewPausedFrame = true;
    }
    this.realTime += frameDt;
    const result = this.sim.frame(frameDt);
    for (const event of this.sim.drainEvents()) this.onCrack(event);
    this.effects.update(this.paused ? 0 : frameDt);

    const rope = this.sim.model.rope;
    const tip = rope.nodeCount - 1;
    if (!this.paused && result.steps > 0) {
      const a = result.alpha;
      this.trail.push(
        this.sim.prevX[tip] + (rope.x[tip] - this.sim.prevX[tip]) * a,
        this.sim.prevY[tip] + (rope.y[tip] - this.sim.prevY[tip]) * a,
        this.sim.time,
        this.sim.metrics.tipSpeed,
      );
      this.audio.setSwing(this.sim.metrics.tipSpeed / (this.sim.params.crackSpeed * 1.3));
    }

    const s = this.settings;
    this.renderer.draw(this.sim, this.paused ? 1 : result.alpha, this.effects, this.trail, {
      theme: getTheme(s.theme),
      background: s.background,
      handleColor: s.handleColor,
      ropeColor: s.ropeColor,
      thickness: s.thickness,
      trail: s.accessibility.reduceMotion ? s.trail * 0.4 : s.trail,
      subdivisions: QUALITY_PRESETS[s.quality].splineSubdivisions,
      labOverlay: false,
      target: null,
      time: this.realTime,
      effectsOpacity: s.desktop.effectsOpacity,
    });
  }

  private onCrack(event: CrackEvent): void {
    this.cracks++;
    this.effects.trigger(event);
    const pan = event.x / Math.max(1, this.renderer.camera.halfWidth);
    // Muted: no voice is created at all (not just a silent one).
    const played = !this.muted && this.audio.playCrack(event, 1, pan);
    if (played) this.sounds++;
    this.bridge.reportOverlay({ type: 'crack', cracks: this.cracks, soundPlayed: played });
  }

  dispose(): void {
    this.input.dispose();
    this.audio.dispose();
  }
}
