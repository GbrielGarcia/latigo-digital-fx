/**
 * Contract between the Electron preload script and the renderer. The renderer
 * also runs in a plain browser (dev preview), where the bridge is absent and
 * settings fall back to localStorage.
 */
export interface DesktopBridge {
  readonly platform: string;
  readonly isSmokeTest: boolean;
  loadSettings(): Promise<string | null>;
  saveSettings(serialized: string): Promise<boolean>;
  settingsLocation(): Promise<string>;
  reportReady(report: SmokeReport): void;
  setFullScreen(on: boolean): Promise<boolean>;
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
  settingsLocation: 'settings:location',
  ready: 'app:ready',
  fullScreen: 'window:fullscreen',
} as const;

declare global {
  interface Window {
    latigoDesktop?: DesktopBridge;
  }
}
