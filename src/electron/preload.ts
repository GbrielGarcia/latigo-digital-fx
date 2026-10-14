import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAction, DesktopStatus, OverlayCommand, OverlayReport } from '../desktop/protocol';
import { IPC_CHANNELS, type DesktopBridge, type SmokeReport } from '../shared/bridge';

/**
 * Minimal, explicit API exposed to the sandboxed renderers. No Node.js access
 * leaks into the pages; only these functions are available.
 */
const role = process.argv.includes('--latigo-role=overlay') ? 'overlay' : 'main';

function on<T extends unknown[]>(channel: string, callback: (...args: T) => void): void {
  ipcRenderer.on(channel, (_event, ...args) => callback(...(args as T)));
}

const bridge: DesktopBridge = {
  platform: process.platform,
  role,
  isSmokeTest: process.argv.includes('--latigo-smoke-test'),
  loadSettings: () => ipcRenderer.invoke(IPC_CHANNELS.loadSettings) as Promise<string | null>,
  saveSettings: (serialized: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveSettings, serialized) as Promise<boolean>,
  applySettings: (serialized: string) => ipcRenderer.send(IPC_CHANNELS.applySettings, serialized),
  onSettingsChanged: (cb: (serialized: string) => void) => on(IPC_CHANNELS.settingsChanged, cb),
  settingsLocation: () => ipcRenderer.invoke(IPC_CHANNELS.settingsLocation) as Promise<string>,
  reportReady: (report: SmokeReport) => ipcRenderer.send(IPC_CHANNELS.ready, report),
  setFullScreen: (on: boolean) => ipcRenderer.invoke(IPC_CHANNELS.fullScreen, on) as Promise<boolean>,
  desktopAction: (action: DesktopAction) => ipcRenderer.send(IPC_CHANNELS.desktopAction, action),
  getDesktopStatus: () => ipcRenderer.invoke(IPC_CHANNELS.desktopStatus) as Promise<DesktopStatus>,
  onDesktopStatus: (cb: (status: DesktopStatus) => void) => on(IPC_CHANNELS.desktopStatusChanged, cb),
  onCursor: (cb: (x: number, y: number) => void) => on(IPC_CHANNELS.overlayCursor, cb),
  onOverlayCommand: (cb: (command: OverlayCommand) => void) => on(IPC_CHANNELS.overlayCommand, cb),
  reportOverlay: (report: OverlayReport) => ipcRenderer.send(IPC_CHANNELS.overlayReport, report),
};

contextBridge.exposeInMainWorld('latigoDesktop', bridge);
