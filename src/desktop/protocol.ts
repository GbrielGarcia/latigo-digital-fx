import type { ShortcutAction } from './accelerators';
import type { PlatformCapabilities } from './capabilities';
import type { ShortcutStatus } from './shortcutManager';

/** Actions available from global shortcuts, the tray and the settings UI. */
export type DesktopAction =
  ShortcutAction | 'reset' | 'enable' | 'disable' | 'clickThrough' | 'showSettings' | 'quit';

export const DESKTOP_ACTIONS: readonly DesktopAction[] = [
  'strike',
  'toggle',
  'pause',
  'mute',
  'reset',
  'enable',
  'disable',
  'clickThrough',
  'showSettings',
  'quit',
];

export function isDesktopAction(value: unknown): value is DesktopAction {
  return typeof value === 'string' && (DESKTOP_ACTIONS as readonly string[]).includes(value);
}

/** Main process → overlay renderer. */
export type OverlayCommand =
  | { type: 'strike' }
  | { type: 'reset' }
  | { type: 'pause'; paused: boolean }
  | { type: 'interactive'; on: boolean }
  /** Overlay moved to another display; the whip restarts at the cursor (local CSS px). */
  | { type: 'display'; cursorX: number; cursorY: number }
  | { type: 'status' };

/** Overlay renderer → main process. */
export type OverlayReport =
  | { type: 'ready' }
  | { type: 'crack'; cracks: number; soundPlayed: boolean }
  | {
      type: 'status';
      steps: number;
      cracks: number;
      sounds: number;
      paused: boolean;
      muted: boolean;
      audioStatus: string;
      transparent: boolean;
      width: number;
      height: number;
    };

export interface DesktopStatus {
  /** False in the browser preview (no Electron). */
  supported: boolean;
  enabled: boolean;
  overlayVisible: boolean;
  paused: boolean;
  clickThrough: boolean;
  cursorTracking: boolean;
  displays: number;
  shortcuts: ShortcutStatus[];
  capabilities: PlatformCapabilities | null;
}
