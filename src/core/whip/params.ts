import { clamp, lerp } from '../math/scalar';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  nodeCount: number;
  /** Coarser ropes amplify tip speed less; scales the crack threshold. */
  crackScale: number;
  iterations: number;
  physicsHz: number;
  maxParticles: number;
  splineSubdivisions: number;
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  low: {
    nodeCount: 16,
    crackScale: 0.7,
    iterations: 8,
    physicsHz: 120,
    maxParticles: 96,
    splineSubdivisions: 3,
  },
  medium: {
    nodeCount: 24,
    crackScale: 0.85,
    iterations: 12,
    physicsHz: 180,
    maxParticles: 192,
    splineSubdivisions: 4,
  },
  high: {
    nodeCount: 32,
    crackScale: 1,
    iterations: 16,
    physicsHz: 240,
    maxParticles: 320,
    splineSubdivisions: 5,
  },
  ultra: {
    nodeCount: 48,
    crackScale: 1.1,
    iterations: 24,
    physicsHz: 360,
    maxParticles: 512,
    splineSubdivisions: 6,
  },
};

/** User-facing tuning values, all normalised or in metres. */
export interface WhipTuning {
  /** Rope length in metres (handle excluded). */
  length: number;
  nodeCount: number;
  /** Strike strength multiplier (0.2 – 2). */
  force: number;
  /** 0 = stiff, 1 = very floppy. */
  flexibility: number;
  /** 0 = almost no air drag, 1 = heavy drag. */
  damping: number;
  /** Pointer follow responsiveness (0.1 – 1). */
  sensitivity: number;
  quality: QualityLevel;
}

/** Fully resolved physical parameters used by the simulation. */
export interface WhipParams {
  nodeCount: number;
  length: number;
  handleLength: number;
  baseMass: number;
  taper: number;
  bendStiffness: number;
  dampingPerSecond: number;
  gravity: number;
  iterations: number;
  physicsHz: number;
  maxNodeSpeed: number;
  maxGripSpeed: number;
  gripFollowRate: number;
  handleTilt: number;
  force: number;
  /** Tip speed (m/s) above which a crack can be detected. */
  crackSpeed: number;
}

export const DEFAULT_TUNING: Readonly<WhipTuning> = {
  length: 2.2,
  nodeCount: QUALITY_PRESETS.high.nodeCount,
  force: 1,
  flexibility: 0.55,
  damping: 0.3,
  sensitivity: 0.7,
  quality: 'high',
};

export function resolveParams(tuning: WhipTuning): WhipParams {
  const preset = QUALITY_PRESETS[tuning.quality] ?? QUALITY_PRESETS.high;
  const length = clamp(tuning.length, 0.8, 4);
  const nodeCount = clamp(Math.round(tuning.nodeCount), 8, 96);
  const flexibility = clamp(tuning.flexibility, 0, 1);
  return {
    nodeCount,
    length,
    handleLength: 0.32,
    // Total rope mass ~0.35 kg distributed over the nodes.
    baseMass: (0.35 / nodeCount) * 2.4,
    taper: 0.92,
    bendStiffness: lerp(0.55, 0.04, flexibility),
    dampingPerSecond: lerp(0.6, 3.5, clamp(tuning.damping, 0, 1)),
    gravity: 9.81,
    iterations: preset.iterations,
    physicsHz: preset.physicsHz,
    maxNodeSpeed: 650,
    maxGripSpeed: 45,
    gripFollowRate: lerp(8, 70, clamp(tuning.sensitivity, 0, 1)),
    handleTilt: 0.08,
    force: clamp(tuning.force, 0.2, 2),
    // Longer whips reach higher tip speeds; scale the threshold accordingly.
    crackSpeed: 30 * Math.sqrt(length / 2.2) * preset.crackScale,
  };
}
