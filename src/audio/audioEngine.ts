import { clamp } from '../core/math/scalar';
import type { CrackEvent } from '../core/whip/crackDetector';
import { randomCrackParams, synthesizeCrack, synthesizeWhooshLoop } from './crackSynth';
import { SoundGate } from './soundGate';

export type AudioStatus = 'idle' | 'running' | 'suspended' | 'unavailable' | 'error';

export const AUDIO_STATUS_LABELS: Readonly<Record<AudioStatus, string>> = {
  idle: 'Inactivo (esperando interacción)',
  running: 'Activo',
  suspended: 'Suspendido',
  unavailable: 'No disponible',
  error: 'Error del dispositivo',
};

const VARIANT_COUNT = 8;

/**
 * Web Audio playback for cracks and the swing whoosh. Independent from the
 * renderer: callers push events, nothing here blocks the frame loop. If no
 * audio device is available the engine reports `unavailable` and every call
 * becomes a no-op, so the simulation keeps running.
 */
export class AudioEngine {
  status: AudioStatus = 'idle';
  lastError = '';
  readonly gate = new SoundGate();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers: AudioBuffer[] = [];
  private whooshGain: GainNode | null = null;
  private whooshFilter: BiquadFilterNode | null = null;
  private volume = 0.8;
  private muted = false;
  private lastVariant = -1;
  private variantCursor = 0;
  private initAttempts = 0;

  /** Creates the AudioContext lazily. Safe to call repeatedly. */
  init(): boolean {
    if (this.ctx && this.ctx.state !== 'closed') return true;
    if (this.initAttempts > 5) return false;
    this.initAttempts++;
    const Ctor: typeof AudioContext | undefined =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      this.status = 'unavailable';
      this.lastError = 'Web Audio API no disponible';
      return false;
    }
    try {
      const ctx = new Ctor({ latencyHint: 'interactive' });
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -6;
      compressor.knee.value = 6;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.001;
      compressor.release.value = 0.12;
      const master = ctx.createGain();
      master.gain.value = this.effectiveVolume();
      master.connect(compressor).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.buffers = [];
      for (let i = 0; i < VARIANT_COUNT; i++) {
        const seed = 1000 + i * 7919;
        const data = synthesizeCrack(ctx.sampleRate, randomCrackParams(seed), seed);
        const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
        buffer.copyToChannel(data, 0);
        this.buffers.push(buffer);
      }
      this.setupWhoosh(ctx, master);
      ctx.onstatechange = () => this.syncStatus();
      this.syncStatus();
      return true;
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      this.ctx = null;
      return false;
    }
  }

  private setupWhoosh(ctx: AudioContext, master: GainNode): void {
    const data = synthesizeWhooshLoop(ctx.sampleRate, 2, 77);
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.copyToChannel(data, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(master);
    source.start();
    this.whooshGain = gain;
    this.whooshFilter = filter;
  }

  private syncStatus(): void {
    const state = this.ctx?.state;
    if (state === 'running') this.status = 'running';
    else if (state === 'suspended') this.status = 'suspended';
    else if (state === 'closed') {
      this.status = 'error';
      this.ctx = null;
    } else this.status = 'suspended';
  }

  /** Call from a user gesture or when the window regains focus. */
  resume(): void {
    if (!this.ctx) {
      if (!this.init()) return;
    }
    const ctx = this.ctx;
    if (ctx && ctx.state !== 'running') {
      ctx.resume().then(
        () => this.syncStatus(),
        (error: unknown) => {
          this.status = 'error';
          this.lastError = error instanceof Error ? error.message : String(error);
        },
      );
    }
  }

  /** Suspend when the window is hidden to free the audio device. */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().then(
        () => this.syncStatus(),
        () => undefined,
      );
    }
  }

  private effectiveVolume(): number {
    return this.muted ? 0 : clamp(this.volume, 0, 1);
  }

  private applyMasterGain(immediate: boolean): void {
    if (!this.ctx || !this.master) return;
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    if (immediate) g.setValueAtTime(this.effectiveVolume(), now);
    else g.setTargetAtTime(this.effectiveVolume(), now, 0.015);
  }

  setVolume(volume: number): void {
    this.volume = clamp(volume, 0, 1);
    this.applyMasterGain(false);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    // Muting must be instantaneous.
    this.applyMasterGain(true);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Latency estimate in milliseconds, when the platform reports it. */
  get latencyMs(): number | null {
    if (!this.ctx) return null;
    const base = this.ctx.baseLatency ?? 0;
    const output = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return (base + output) * 1000;
  }

  /**
   * Plays the crack for a physics event. `pitch` < 1 is used in slow motion
   * so the sound stretches with time; normal mode always uses 1.
   * `pan` in [-1, 1] places the sound where the tip cracked.
   */
  playCrack(event: CrackEvent, pitch = 1, pan = 0): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.status !== 'running' || this.buffers.length === 0) return false;
    if (!this.gate.tryAcquire(ctx.currentTime, event.id)) return false;
    try {
      // Pick a different variant each time for natural variation.
      let variant = (this.variantCursor + 1 + (event.id % (VARIANT_COUNT - 1))) % VARIANT_COUNT;
      if (variant === this.lastVariant) variant = (variant + 1) % VARIANT_COUNT;
      this.lastVariant = variant;
      this.variantCursor = variant;
      const source = ctx.createBufferSource();
      source.buffer = this.buffers[variant];
      const jitter = 1 + (((event.id * 37) % 13) - 6) / 100;
      source.playbackRate.value = clamp(pitch, 0.25, 1.5) * jitter;
      const gain = ctx.createGain();
      gain.gain.value = 0.3 + 0.7 * clamp(event.intensity, 0, 1);
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1) * 0.6;
      source.connect(gain).connect(panner).connect(this.master);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        panner.disconnect();
      };
      source.start();
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  /** Swing whoosh driven by normalised tip speed (0 – 1). */
  setSwing(amount: number): void {
    if (!this.ctx || !this.whooshGain || !this.whooshFilter) return;
    const a = clamp(amount, 0, 1);
    const now = this.ctx.currentTime;
    this.whooshGain.gain.setTargetAtTime(a * a * 0.22, now, 0.03);
    this.whooshFilter.frequency.setTargetAtTime(350 + a * 1400, now, 0.05);
  }

  dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => undefined);
    }
    this.ctx = null;
    this.master = null;
    this.whooshGain = null;
    this.whooshFilter = null;
    this.buffers = [];
    this.status = 'idle';
  }
}
