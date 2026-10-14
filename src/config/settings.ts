import { clamp } from '../core/math/scalar';
import type { QualityLevel } from '../core/whip/params';
import type { StrikeStyle } from '../core/whip/strikeDriver';
import {
  DEFAULT_SHORTCUTS,
  normaliseAccelerator,
  SHORTCUT_ACTIONS,
  type ShortcutAction,
} from '../desktop/accelerators';

/** v2 adds the `desktop` section; v1 files are migrated without data loss. */
export const SETTINGS_VERSION = 2;
/** Hard limit for the serialised settings file (bytes / characters). */
export const MAX_SETTINGS_SIZE = 64 * 1024;

export type ThemeId = 'dark' | 'neon' | 'light';
export type BackgroundStyle = 'gradient' | 'solid' | 'grid';
export type AppMode = 'free' | 'practice' | 'demo' | 'lab' | 'slowmo' | 'training';

export interface AccessibilitySettings {
  reduceMotion: boolean;
  disableFlash: boolean;
  disableShake: boolean;
}

export type CloseBehavior = 'tray' | 'quit';

/** «Modo escritorio»: the global overlay over other applications. */
export interface DesktopSettings {
  /** Master switch for the global desktop mode (off by default). */
  enabled: boolean;
  overlayVisible: boolean;
  /** Feed the global cursor position into the simulation. */
  followCursor: boolean;
  /** Let clicks pass through the transparent overlay to the apps below. */
  clickThrough: boolean;
  /** Move the overlay to the monitor under the cursor. */
  multiMonitor: boolean;
  sound: boolean;
  /** Opacity of trails, sparks and shockwaves (the empty area stays transparent). */
  effectsOpacity: number;
  /** Whip reach as a fraction of the screen height. */
  whipSize: number;
  closeBehavior: CloseBehavior;
  shortcuts: Record<ShortcutAction, string>;
}

export interface Settings {
  version: number;
  theme: ThemeId;
  quality: QualityLevel;
  nodeCount: number;
  length: number;
  thickness: number;
  force: number;
  flexibility: number;
  damping: number;
  sensitivity: number;
  volume: number;
  muted: boolean;
  effectsIntensity: number;
  trail: number;
  particles: number;
  /** '' means "use the theme colour". */
  handleColor: string;
  ropeColor: string;
  background: BackgroundStyle;
  mode: AppMode;
  slowMotionScale: number;
  strikeStyle: StrikeStyle;
  panelsVisible: boolean;
  accessibility: AccessibilitySettings;
  desktop: DesktopSettings;
}

export const DEFAULT_DESKTOP_SETTINGS: Readonly<DesktopSettings> = Object.freeze({
  enabled: false,
  overlayVisible: true,
  followCursor: true,
  clickThrough: true,
  multiMonitor: true,
  sound: true,
  effectsOpacity: 0.9,
  whipSize: 0.45,
  closeBehavior: 'tray',
  shortcuts: Object.freeze({ ...DEFAULT_SHORTCUTS }),
}) as DesktopSettings;

export const DESKTOP_RANGES = {
  effectsOpacity: { min: 0.1, max: 1, step: 0.01 },
  whipSize: { min: 0.2, max: 0.9, step: 0.01 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

export function cloneDesktopDefaults(): DesktopSettings {
  return { ...DEFAULT_DESKTOP_SETTINGS, shortcuts: { ...DEFAULT_DESKTOP_SETTINGS.shortcuts } };
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: SETTINGS_VERSION,
  theme: 'dark',
  quality: 'high',
  nodeCount: 32,
  length: 2.2,
  thickness: 1,
  force: 1,
  flexibility: 0.55,
  damping: 0.3,
  sensitivity: 0.7,
  volume: 0.8,
  muted: false,
  effectsIntensity: 0.8,
  trail: 0.7,
  particles: 0.7,
  handleColor: '',
  ropeColor: '',
  background: 'gradient',
  mode: 'practice',
  slowMotionScale: 0.2,
  strikeStyle: 'side',
  panelsVisible: true,
  accessibility: Object.freeze({ reduceMotion: false, disableFlash: false, disableShake: false }),
  desktop: DEFAULT_DESKTOP_SETTINGS,
}) as Settings;

/** Numeric ranges (also used by the UI sliders). */
export const RANGES = {
  nodeCount: { min: 8, max: 96, step: 1 },
  length: { min: 1, max: 3.5, step: 0.05 },
  thickness: { min: 0.5, max: 2, step: 0.05 },
  force: { min: 0.2, max: 2, step: 0.05 },
  flexibility: { min: 0, max: 1, step: 0.01 },
  damping: { min: 0, max: 1, step: 0.01 },
  sensitivity: { min: 0.1, max: 1, step: 0.01 },
  volume: { min: 0, max: 1, step: 0.01 },
  effectsIntensity: { min: 0, max: 1, step: 0.01 },
  trail: { min: 0, max: 1, step: 0.01 },
  particles: { min: 0, max: 1, step: 0.01 },
  slowMotionScale: { min: 0.05, max: 0.5, step: 0.01 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

type NumericKey = keyof typeof RANGES;

const ENUMS = {
  theme: ['dark', 'neon', 'light'],
  quality: ['low', 'medium', 'high', 'ultra'],
  background: ['gradient', 'solid', 'grid'],
  mode: ['free', 'practice', 'demo', 'lab', 'slowmo', 'training'],
  strikeStyle: ['side', 'overhead', 'upward'],
} as const;

const COLOR_RE = /^#[0-9a-f]{6}$/i;

export interface LoadResult {
  settings: Settings;
  /** True when the input was missing, corrupt or had invalid fields. */
  recovered: boolean;
  issues: string[];
}

export function cloneDefaults(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    accessibility: { ...DEFAULT_SETTINGS.accessibility },
    desktop: cloneDesktopDefaults(),
  };
}

function validateDesktop(input: unknown, target: DesktopSettings, issues: string[]): void {
  if (!isRecord(input)) {
    issues.push('desktop: invalid object');
    return;
  }
  for (const key of [
    'enabled',
    'overlayVisible',
    'followCursor',
    'clickThrough',
    'multiMonitor',
    'sound',
  ] as const) {
    if (!(key in input)) continue;
    if (typeof input[key] === 'boolean') target[key] = input[key] as boolean;
    else issues.push(`desktop.${key}: invalid boolean`);
  }
  for (const key of Object.keys(DESKTOP_RANGES) as (keyof typeof DESKTOP_RANGES)[]) {
    if (!(key in input)) continue;
    const raw = input[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      issues.push(`desktop.${key}: invalid number`);
      continue;
    }
    target[key] = clamp(raw, DESKTOP_RANGES[key].min, DESKTOP_RANGES[key].max);
  }
  if ('closeBehavior' in input) {
    if (input.closeBehavior === 'tray' || input.closeBehavior === 'quit')
      target.closeBehavior = input.closeBehavior;
    else issues.push('desktop.closeBehavior: invalid value');
  }
  if ('shortcuts' in input) {
    const sc = input.shortcuts;
    if (isRecord(sc)) {
      for (const action of SHORTCUT_ACTIONS) {
        if (!(action in sc)) continue;
        const norm = normaliseAccelerator(sc[action]);
        if (norm) target.shortcuts[action] = norm;
        else issues.push(`desktop.shortcuts.${action}: invalid accelerator`);
      }
    } else {
      issues.push('desktop.shortcuts: invalid object');
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates an arbitrary value into a complete Settings object. Unknown keys
 * are dropped, out-of-range numbers are clamped and invalid values fall back
 * to defaults. Never throws.
 */
export function validateSettings(input: unknown): LoadResult {
  const settings = cloneDefaults();
  const issues: string[] = [];
  if (!isRecord(input)) {
    return { settings, recovered: true, issues: ['settings is not an object'] };
  }

  for (const key of Object.keys(RANGES) as NumericKey[]) {
    if (!(key in input)) continue;
    const raw = input[key];
    const range = RANGES[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      issues.push(`${key}: invalid number`);
      continue;
    }
    const value = clamp(raw, range.min, range.max);
    if (value !== raw) issues.push(`${key}: clamped`);
    settings[key] = key === 'nodeCount' ? Math.round(value) : value;
  }

  for (const key of Object.keys(ENUMS) as (keyof typeof ENUMS)[]) {
    if (!(key in input)) continue;
    const raw = input[key];
    const allowed = ENUMS[key] as readonly string[];
    if (typeof raw === 'string' && allowed.includes(raw)) {
      (settings as unknown as Record<string, unknown>)[key] = raw;
    } else {
      issues.push(`${key}: invalid value`);
    }
  }

  for (const key of ['handleColor', 'ropeColor'] as const) {
    if (!(key in input)) continue;
    const raw = input[key];
    if (raw === '' || (typeof raw === 'string' && COLOR_RE.test(raw))) {
      settings[key] = (raw as string).toLowerCase();
    } else {
      issues.push(`${key}: invalid colour`);
    }
  }

  for (const key of ['muted', 'panelsVisible'] as const) {
    if (!(key in input)) continue;
    if (typeof input[key] === 'boolean') settings[key] = input[key] as boolean;
    else issues.push(`${key}: invalid boolean`);
  }

  if ('accessibility' in input) {
    const a = input.accessibility;
    if (isRecord(a)) {
      for (const key of ['reduceMotion', 'disableFlash', 'disableShake'] as const) {
        if (!(key in a)) continue;
        if (typeof a[key] === 'boolean') settings.accessibility[key] = a[key] as boolean;
        else issues.push(`accessibility.${key}: invalid boolean`);
      }
    } else {
      issues.push('accessibility: invalid object');
    }
  }

  if ('desktop' in input) validateDesktop(input.desktop, settings.desktop, issues);

  if (input.version !== SETTINGS_VERSION) issues.push('version: migrated');
  settings.version = SETTINGS_VERSION;
  return { settings, recovered: issues.some((i) => !i.startsWith('version')), issues };
}

/** Parses serialised settings (from disk or localStorage). Never throws. */
export function parseSettings(raw: string | null | undefined): LoadResult {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { settings: cloneDefaults(), recovered: false, issues: ['no stored settings'] };
  }
  if (raw.length > MAX_SETTINGS_SIZE) {
    return { settings: cloneDefaults(), recovered: true, issues: ['settings file too large'] };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { settings: cloneDefaults(), recovered: true, issues: ['settings file is not valid JSON'] };
  }
  return validateSettings(data);
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings, null, 2);
}
