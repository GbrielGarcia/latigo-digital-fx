/**
 * Decides whether a crack sound may play. Guards against duplicated triggers
 * (same event id, or two events too close together) and bounds the number of
 * simultaneously playing voices so audio work can never grow without limit.
 */
export interface SoundGateOptions {
  /** Minimum time between two crack sounds (s). */
  minInterval: number;
  /** Maximum overlapping voices. */
  maxVoices: number;
  /** How long a voice is considered active (s). */
  voiceDuration: number;
}

export const DEFAULT_SOUND_GATE: SoundGateOptions = {
  minInterval: 0.08,
  maxVoices: 6,
  voiceDuration: 0.4,
};

export class SoundGate {
  options: SoundGateOptions;
  private lastTime = Number.NEGATIVE_INFINITY;
  private lastId = -1;
  private voiceEnds: number[] = [];
  rejected = 0;
  accepted = 0;

  constructor(options: SoundGateOptions = DEFAULT_SOUND_GATE) {
    this.options = options;
  }

  /** `now` is a monotonic clock in seconds; `eventId` the crack event id. */
  tryAcquire(now: number, eventId: number): boolean {
    this.voiceEnds = this.voiceEnds.filter((end) => end > now);
    if (eventId === this.lastId || now - this.lastTime < this.options.minInterval) {
      this.rejected++;
      return false;
    }
    if (this.voiceEnds.length >= this.options.maxVoices) {
      this.rejected++;
      return false;
    }
    this.lastId = eventId;
    this.lastTime = now;
    this.voiceEnds.push(now + this.options.voiceDuration);
    this.accepted++;
    return true;
  }

  get activeVoices(): number {
    return this.voiceEnds.length;
  }

  reset(): void {
    this.lastTime = Number.NEGATIVE_INFINITY;
    this.lastId = -1;
    this.voiceEnds = [];
  }
}
