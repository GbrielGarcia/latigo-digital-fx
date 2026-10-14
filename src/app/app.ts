import { AUDIO_STATUS_LABELS, AudioEngine } from '../audio/audioEngine';
import {
  cloneDefaults,
  cloneDesktopDefaults,
  parseSettings,
  serializeSettings,
  validateSettings,
  type AppMode,
  type Settings,
} from '../config/settings';
import { DemoDirector } from '../core/modes/demoDirector';
import { TrainingSession } from '../core/modes/trainingSession';
import { Simulation } from '../core/simulation';
import type { CrackEvent } from '../core/whip/crackDetector';
import { QUALITY_PRESETS } from '../core/whip/params';
import { paramsFromSettings } from '../config/physicsFromSettings';
import { PHASE_LABELS, type WhipPhase } from '../core/whip/phaseMachine';
import { FrameStats } from '../diagnostics/frameStats';
import { InputController } from '../input/inputController';
import { ImpactEffects, TipTrail } from '../render/effects';
import { Renderer } from '../render/renderer';
import { getTheme } from '../render/themes';
import { Ui } from '../ui/ui';
import { SettingsPersistence } from './persistence';

const MODE_LABELS: Record<AppMode, string> = {
  free: 'Libre',
  practice: 'Práctica',
  demo: 'Demostración',
  lab: 'Laboratorio',
  slowmo: 'Cámara lenta',
  training: 'Entrenamiento',
};

/**
 * Wires simulation, renderer, audio, input and UI together and runs the
 * frame loop. Each subsystem stays independent; this class only routes data.
 */
export class LatigoApp {
  settings: Settings;
  readonly sim: Simulation;
  readonly renderer: Renderer;
  readonly audio = new AudioEngine();
  readonly effects = new ImpactEffects(QUALITY_PRESETS.ultra.maxParticles);
  readonly trail = new TipTrail(96);
  readonly stats = new FrameStats();
  readonly demo = new DemoDirector();
  readonly training = new TrainingSession();
  readonly ui: Ui;
  readonly persistence: SettingsPersistence;
  private input: InputController;
  private readonly canvas: HTMLCanvasElement;
  private lastFrame = 0;
  private realTime = 0;
  private rafId = 0;
  private labTimer = 0;
  private lastCrack: CrackEvent | null = null;
  private lastCrackAt = -Infinity;
  private strokeWithoutCrack = false;
  private previousPhase: WhipPhase = 'rest';
  private previousMode: AppMode = 'practice';
  private userInteracted = false;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement, settings: Settings, persistence: SettingsPersistence) {
    this.canvas = canvas;
    this.settings = settings;
    this.persistence = persistence;
    this.sim = new Simulation(paramsFromSettings(settings));
    this.renderer = new Renderer(canvas);
    this.ui = new Ui({
      onSetting: (path, value) => this.changeSetting(path, value),
      onStrike: () => this.strike(),
      onPause: () => this.togglePause(),
      onReset: () => this.resetWhip(),
      onMute: () => this.toggleMute(),
      onHelp: () => this.toggleHelp(),
      onFullscreen: () => void this.toggleFullscreen(),
      onTogglePanels: () => this.togglePanels(),
      onToggleSettingsPanel: () => this.ui.setSettingsOpen(!this.ui.settingsOpen),
      onRestoreDefaults: () => this.restoreDefaults(),
      onRestoreDesktopDefaults: () => this.restoreDesktopDefaults(),
    });
    const bridge = window.latigoDesktop;
    if (bridge?.platform) this.ui.platform = bridge.platform;
    this.input = new InputController(canvas, {
      pointerMove: (x, y) => this.sim.pointerMove(this.toWorldX(x), this.toWorldY(y)),
      pointerDown: (x, y) => {
        this.wakeAudio();
        this.sim.pointerDown(this.toWorldX(x), this.toWorldY(y));
      },
      pointerUp: (x, y) => this.sim.pointerUp(this.toWorldX(x), this.toWorldY(y)),
      pointerCancel: () => this.sim.cancelPointer(),
      strike: () => this.strike(),
      reset: () => this.resetWhip(),
      togglePause: () => this.togglePause(),
      toggleMute: () => this.toggleMute(),
      toggleHelp: () => this.toggleHelp(),
      toggleLab: () => this.toggleLab(),
      toggleFullscreen: () => void this.toggleFullscreen(),
      togglePanels: () => this.togglePanels(),
      escape: () => this.escape(),
      userActivity: () => this.demo.notifyUserInput(),
    });
    this.ui.syncFromSettings(settings);
    this.applySettings(settings, true);
    this.handleResize();
    this.sim.reset(-0.6, 0.4);
    this.placeTrainingTarget();
    window.addEventListener('resize', () => this.handleResize());
    document.addEventListener('visibilitychange', () => this.onVisibilityChange());
    window.addEventListener('focus', () => this.userInteracted && this.audio.resume());
    window.addEventListener('pointerdown', () => this.wakeAudio(), { capture: true });
    window.addEventListener('keydown', () => this.wakeAudio(), { capture: true });
    window.addEventListener('beforeunload', () => {
      void this.persistence.saveNow(this.settings);
      this.audio.dispose();
    });
  }

  // ---- Lifecycle -----------------------------------------------------------

  start(): void {
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      this.rafId = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.audio.dispose();
  }

  /** Initialises audio without waiting for a gesture (desktop shell only). */
  enableAudio(): void {
    this.wakeAudio();
  }

  private wakeAudio(): void {
    this.userInteracted = true;
    if (this.audio.status !== 'running') {
      this.audio.init();
      this.audio.setVolume(this.settings.volume);
      this.audio.setMuted(this.settings.muted);
      this.audio.resume();
    }
  }

  private onVisibilityChange(): void {
    if (document.hidden) {
      this.sim.cancelPointer();
      this.audio.suspend();
    } else {
      // The fixed stepper clamps the long frame; reset the clock as well.
      this.lastFrame = performance.now();
      if (this.userInteracted) this.audio.resume();
    }
  }

  private handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    const p = this.sim.params;
    this.renderer.resize(rect.width, rect.height, this.dpr, p.length + p.handleLength);
    const cam = this.renderer.camera;
    const m = 0.15;
    this.sim.setBounds(-cam.halfWidth + m, cam.halfWidth - m, -cam.halfHeight + m, cam.halfHeight - m);
  }

  private toWorldX(x: number): number {
    return this.renderer.camera.toWorldX(x);
  }

  private toWorldY(y: number): number {
    return this.renderer.camera.toWorldY(y);
  }

  // ---- Frame ---------------------------------------------------------------

  private frame(now: number): void {
    const frameDt = Math.max(0, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.realTime += frameDt;
    if ((window.devicePixelRatio || 1) !== this.dpr) this.handleResize();

    const s = this.settings;
    const slow = s.mode === 'slowmo';
    this.sim.timeScale = slow ? s.slowMotionScale : 1;

    if (s.mode === 'demo' && !this.sim.paused) {
      this.demo.update(frameDt, this.sim, this.renderer.camera.halfWidth);
    }

    const result = this.sim.frame(frameDt);
    this.stats.record(frameDt, result.steps, result.droppedTime);

    for (const event of this.sim.drainEvents()) this.onCrack(event);

    const effectDt = this.sim.paused ? 0 : frameDt * this.sim.timeScale;
    this.effects.update(effectDt);

    const rope = this.sim.model.rope;
    const tip = rope.nodeCount - 1;
    if (!this.sim.paused && result.steps > 0) {
      const a = result.alpha;
      const tx = this.sim.prevX[tip] + (rope.x[tip] - this.sim.prevX[tip]) * a;
      const ty = this.sim.prevY[tip] + (rope.y[tip] - this.sim.prevY[tip]) * a;
      this.trail.push(tx, ty, this.sim.time, this.sim.metrics.tipSpeed);
    }

    const swing = this.sim.paused
      ? 0
      : (this.sim.metrics.tipSpeed / (this.sim.params.crackSpeed * 1.3)) * (slow ? 0.5 : 1);
    this.audio.setSwing(swing);

    const theme = getTheme(s.theme);
    this.renderer.draw(this.sim, result.alpha, this.effects, this.trail, {
      theme,
      background: s.background,
      handleColor: s.handleColor,
      ropeColor: s.ropeColor,
      thickness: s.thickness,
      trail: s.accessibility.reduceMotion ? s.trail * 0.4 : s.trail,
      subdivisions: QUALITY_PRESETS[s.quality].splineSubdivisions,
      labOverlay: s.mode === 'lab',
      target: s.mode === 'training' ? this.training.target : null,
      time: this.realTime,
    });

    this.updateHud();
  }

  private onCrack(event: CrackEvent): void {
    this.lastCrack = event;
    this.lastCrackAt = this.realTime;
    this.strokeWithoutCrack = false;
    this.effects.trigger(event);
    const slow = this.settings.mode === 'slowmo';
    // Normal mode always plays at natural pitch; slow motion stretches it.
    const pitch = slow ? Math.max(0.35, Math.sqrt(this.sim.timeScale)) : 1;
    const pan = event.x / Math.max(1, this.renderer.camera.halfWidth);
    this.audio.playCrack(event, pitch, pan);
    if (this.settings.mode === 'training') {
      const result = this.training.register(event);
      if (result.hit) {
        this.ui.toast('¡Objetivo alcanzado!', 1200);
        this.placeTrainingTarget();
      }
    }
  }

  private placeTrainingTarget(): void {
    const cam = this.renderer.camera;
    const p = this.sim.params;
    // Keep the target clear of the top bar and the side panel when visible.
    const topbar = document.getElementById('topbar');
    const panel = document.getElementById('settings-panel');
    const topPx = this.settings.panelsVisible && topbar ? topbar.offsetHeight + 24 : 12;
    const rightPx = this.settings.panelsVisible && panel && !panel.hidden ? panel.offsetWidth + 24 : 12;
    this.training.nextTarget(this.sim.model.gripX, this.sim.model.gripY, p.length + p.handleLength, {
      minX: cam.toWorldX(12),
      maxX: cam.toWorldX(cam.cssWidth - rightPx),
      minY: cam.toWorldY(cam.cssHeight - 120),
      maxY: cam.toWorldY(topPx),
    });
  }

  private updateHud(): void {
    const s = this.settings;
    const phase = this.sim.phase;
    if (this.previousPhase === 'propagation' && phase === 'recovery') this.strokeWithoutCrack = true;
    if (phase === 'acceleration') this.strokeWithoutCrack = false;
    this.previousPhase = phase;

    this.ui.setPhase(phase);
    this.ui.setPhaseVisible(s.mode !== 'free');
    this.ui.setCrackCount(this.sim.detector.count);
    this.ui.setHint(this.hintFor(phase));

    this.labTimer -= 1;
    if (s.mode === 'lab' && this.labTimer <= 0) {
      this.labTimer = 8;
      this.ui.updateLab(this.labRows());
    }
    if (s.mode === 'training') {
      const t = this.training;
      this.ui.updateTraining(t.hits, t.attempts, t.streak, t.bestIntensity);
    }
  }

  private hintFor(phase: WhipPhase): string {
    const mode = this.settings.mode;
    if (mode === 'free' || mode === 'lab') return '';
    if (mode === 'demo') {
      return this.demo.userInControl
        ? 'Has tomado el control. La demostración seguirá en unos segundos sin actividad.'
        : 'Demostración automática. Mueve el ratón para tomar el control.';
    }
    if (mode === 'slowmo') {
      return `Cámara lenta (${this.settings.slowMotionScale.toFixed(2)}×): observa cómo la onda acelera hacia la punta.`;
    }
    if (this.realTime - this.lastCrackAt < 1.2 && this.lastCrack) {
      return `¡Chasquido! Intensidad ${Math.round(this.lastCrack.intensity * 100)} % · velocidad de la punta ${this.lastCrack.peakSpeed.toFixed(0)} m/s.`;
    }
    switch (phase) {
      case 'preparation':
        return 'Arrastra hacia atrás para acumular carga…';
      case 'charge':
        return `Carga ${Math.round(this.sim.charge * 100)} % — suelta para ejecutar el latigazo.`;
      case 'acceleration':
        return 'Aceleración: el mango empuja la onda hacia la cuerda.';
      case 'propagation':
        return 'Propagación: el bucle viaja y acelera hacia la punta…';
      case 'recovery':
      case 'cooldown':
        return this.strokeWithoutCrack
          ? 'Sin chasquido: aumenta la fuerza o haz el gesto más rápido y frena en seco.'
          : 'Recuperación: deja que la cuerda se asiente.';
      default:
        return mode === 'training'
          ? 'Apunta al círculo: el chasquido debe producirse dentro del objetivo.'
          : 'Mueve el ratón para balancear el látigo. Arrastra hacia atrás y suelta, o pulsa Espacio.';
    }
  }

  private labRows(): [string, string][] {
    const sim = this.sim;
    const m = sim.metrics;
    const latency = this.audio.latencyMs;
    return [
      ['FPS', this.stats.fps.toFixed(0)],
      ['Peor fotograma', `${(this.stats.worstFrameTime * 1000).toFixed(1)} ms`],
      ['Frecuencia de simulación', `${sim.params.physicsHz} Hz`],
      ['Pasos por fotograma', String(this.stats.stepsLastFrame)],
      ['Nodos', String(sim.model.rope.nodeCount)],
      ['Iteraciones', String(sim.params.iterations)],
      ['Velocidad del mango', `${m.gripSpeed.toFixed(1)} m/s`],
      ['Velocidad de la punta', `${m.tipSpeed.toFixed(1)} m/s`],
      ['Umbral de chasquido', `${sim.params.crackSpeed.toFixed(1)} m/s`],
      ['Energía estimada', `${(m.kineticEnergy * 1000).toFixed(1)} mJ`],
      ['Nodo más rápido', `${m.fastestNode} / ${sim.model.rope.nodeCount - 1}`],
      ['Estado', PHASE_LABELS[sim.phase]],
      ['Eventos de latigazo', String(sim.detector.count)],
      ['Audio', AUDIO_STATUS_LABELS[this.audio.status]],
      ['Latencia de audio', latency === null ? '—' : `${latency.toFixed(1)} ms`],
      ['Voces activas', String(this.audio.gate.activeVoices)],
      ['Partículas vivas', String(this.effects.particles.alive)],
      ['Recuperaciones numéricas', String(sim.model.recoveries)],
    ];
  }

  // ---- Actions -------------------------------------------------------------

  strike(): void {
    this.wakeAudio();
    this.demo.notifyUserInput();
    if (this.sim.paused) this.togglePause();
    this.sim.strike(this.settings.strikeStyle);
  }

  resetWhip(): void {
    this.sim.reset(-0.6, 0.4);
    this.effects.clear();
    this.trail.clear();
    this.audio.gate.reset();
    this.training.reset();
    this.placeTrainingTarget();
    this.ui.toast('Látigo reiniciado', 1200);
  }

  togglePause(): void {
    this.sim.paused = !this.sim.paused;
    if (this.sim.paused) this.sim.cancelPointer();
    this.ui.setPaused(this.sim.paused);
  }

  toggleMute(): void {
    this.changeSetting('muted', !this.settings.muted);
    this.ui.toast(this.settings.muted ? 'Sonido silenciado' : 'Sonido activado', 1200);
  }

  toggleHelp(): void {
    if (this.ui.helpOpen) this.ui.closeHelp();
    else this.ui.openHelp();
  }

  toggleLab(): void {
    if (this.settings.mode === 'lab')
      this.changeSetting('mode', this.previousMode === 'lab' ? 'practice' : this.previousMode);
    else this.changeSetting('mode', 'lab');
  }

  togglePanels(): void {
    this.changeSetting('panelsVisible', !this.settings.panelsVisible);
  }

  async toggleFullscreen(): Promise<void> {
    const on = !document.fullscreenElement;
    try {
      if (on) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      const bridge = window.latigoDesktop;
      if (bridge) await bridge.setFullScreen(on);
    }
  }

  /** Esc closes the top-most overlay; it never quits the application. */
  escape(): void {
    if (this.ui.helpOpen) this.ui.closeHelp();
    else if (this.sim.pointerHeld) this.sim.cancelPointer();
    else if (document.fullscreenElement) void document.exitFullscreen();
    else if (!this.settings.panelsVisible) this.togglePanels();
    else if (this.ui.settingsOpen) this.ui.setSettingsOpen(false);
  }

  restoreDefaults(): void {
    const defaults = cloneDefaults();
    defaults.mode = this.settings.mode;
    // «Modo escritorio» has its own reset button; keep it untouched here.
    defaults.desktop = structuredClone(this.settings.desktop);
    this.settings = defaults;
    this.ui.syncFromSettings(defaults);
    this.applySettings(defaults, true);
    this.persistence.scheduleSave(defaults, 0);
    window.latigoDesktop?.applySettings(serializeSettings(defaults));
    this.ui.toast('Ajustes restablecidos');
  }

  // ---- Settings --------------------------------------------------------------

  changeSetting(path: string, value: string | number | boolean): void {
    const draft = structuredClone(this.settings) as unknown as Record<string, unknown>;
    const parts = path.split('.');
    let node = draft;
    for (const part of parts.slice(0, -1)) node = node[part] as Record<string, unknown>;
    node[parts[parts.length - 1]] = value;
    if (path === 'quality') draft.nodeCount = QUALITY_PRESETS[value as Settings['quality']].nodeCount;
    const { settings } = validateSettings(draft);
    const previous = this.settings;
    this.settings = settings;
    if (path === 'quality' || path === 'handleColor' || path === 'ropeColor' || path === 'theme') {
      this.ui.syncFromSettings(settings);
    }
    if (path === 'muted' || path === 'panelsVisible' || path.startsWith('desktop.')) {
      this.ui.syncFromSettings(settings);
    }
    if (path === 'mode') this.onModeChange(previous.mode, settings.mode);
    this.applySettings(settings, false);
    this.persistence.scheduleSave(settings);
    // Desktop mode lives in the main process: push every change immediately.
    window.latigoDesktop?.applySettings(serializeSettings(settings));
  }

  /** Settings changed by the tray, a global shortcut or the overlay. */
  applyExternalSettings(serialized: string): void {
    const { settings } = parseSettings(serialized);
    const previousMode = this.settings.mode;
    this.settings = settings;
    this.ui.syncFromSettings(settings);
    if (previousMode !== settings.mode) this.onModeChange(previousMode, settings.mode);
    this.applySettings(settings, false);
    // Replace any pending save so a stale snapshot can never overwrite this one.
    this.persistence.scheduleSave(settings);
  }

  restoreDesktopDefaults(): void {
    const draft = structuredClone(this.settings);
    draft.desktop = { ...cloneDesktopDefaults(), enabled: this.settings.desktop.enabled };
    this.settings = validateSettings(draft).settings;
    this.ui.syncFromSettings(this.settings);
    this.applySettings(this.settings, false);
    this.persistence.scheduleSave(this.settings, 0);
    window.latigoDesktop?.applySettings(serializeSettings(this.settings));
    this.ui.toast('Valores del modo escritorio restaurados');
  }

  private onModeChange(from: AppMode, to: AppMode): void {
    if (from !== to) this.previousMode = from;
    const select = document.getElementById('mode-select') as HTMLSelectElement | null;
    if (select && select.value !== to) select.value = to;
    if (to === 'practice' || to === 'training') this.ui.setSettingsOpen(true);
    if (to === 'training') {
      this.training.reset();
      this.placeTrainingTarget();
    }
    this.ui.toast(`Modo ${MODE_LABELS[to]}`, 1200);
  }

  applySettings(s: Settings, force: boolean): void {
    const params = paramsFromSettings(s);
    const old = this.sim.params;
    this.sim.setParams(params);
    if (force || old.length !== params.length) this.handleResize();
    this.audio.setVolume(s.volume);
    this.audio.setMuted(s.muted);
    this.ui.setMuted(s.muted);
    this.effects.options = {
      intensity: s.effectsIntensity,
      particles: s.particles,
      reduceMotion: s.accessibility.reduceMotion,
      disableFlash: s.accessibility.disableFlash,
      disableShake: s.accessibility.disableShake,
    };
    this.effects.particles.limit = QUALITY_PRESETS[s.quality].maxParticles;
    this.ui.showLab(s.mode === 'lab');
    this.ui.showTraining(s.mode === 'training');
  }
}
