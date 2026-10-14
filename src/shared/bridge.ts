import type { DesktopAction, DesktopStatus, OverlayCommand, OverlayReport } from '../desktop/protocol';

/**
 * Contract between the Electron preload script and the renderers (the main
 * settings window and the transparent overlay). The renderer also runs in a
 * plain browser (dev preview), where the bridge is absent and settings fall
 * back to localStorage.
 */
export type WindowRole = 'main' | 'overlay';

export interface DesktopBridge {
  readonly platform: string;
  readonly role: WindowRole;
  readonly isSmokeTest: boolean;
  loadSettings(): Promise<string | null>;
  saveSettings(serialized: string): Promise<boolean>;
  /** Pushes the current settings to the main process immediately (not persisted). */
  applySettings(serialized: string): void;
  /** Settings changed elsewhere (tray, global shortcut, other window). */
  onSettingsChanged(callback: (serialized: string) => void): void;
  settingsLocation(): Promise<string>;
  reportReady(report: SmokeReport): void;
  setFullScreen(on: boolean): Promise<boolean>;
  desktopAction(action: DesktopAction): void;
  getDesktopStatus(): Promise<DesktopStatus>;
  onDesktopStatus(callback: (status: DesktopStatus) => void): void;
  /** Overlay only: global cursor in overlay-local CSS pixels. */
  onCursor(callback: (x: number, y: number) => void): void;
  /** Overlay only. */
  onOverlayCommand(callback: (command: OverlayCommand) => void): void;
  /** Overlay only. */
  reportOverlay(report: OverlayReport): void;
}

export interface SmokeReport {
  ok: boolean;
  steps: number;
  cracks: number;
  audioStatus: string;
  renderer: string;
  fps?: number;
  error?: string;
}

export const IPC_CHANNELS = {
  loadSettings: 'settings:load',
  saveSettings: 'settings:save',
  applySettings: 'settings:apply',
  settingsChanged: 'settings:changed',
  settingsLocation: 'settings:location',
  ready: 'app:ready',
  fullScreen: 'window:fullscreen',
  desktopAction: 'desktop:action',
  desktopStatus: 'desktop:status',
  desktopStatusChanged: 'desktop:status-changed',
  overlayCursor: 'overlay:cursor',
  overlayCommand: 'overlay:command',
  overlayReport: 'overlay:report',
} as const;

declare global {
  interface Window {
    latigoDesktop?: DesktopBridge;
  }
}
