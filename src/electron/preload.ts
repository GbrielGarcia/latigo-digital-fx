import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type DesktopBridge, type SmokeReport } from '../shared/bridge';

/**
 * Minimal, explicit API exposed to the sandboxed renderer. No Node.js access
 * leaks into the page; only these functions are available.
 */
const bridge: DesktopBridge = {
  platform: process.platform,
  isSmokeTest: process.argv.includes('--latigo-smoke-test'),
  loadSettings: () => ipcRenderer.invoke(IPC_CHANNELS.loadSettings) as Promise<string | null>,
  saveSettings: (serialized: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveSettings, serialized) as Promise<boolean>,
  settingsLocation: () => ipcRenderer.invoke(IPC_CHANNELS.settingsLocation) as Promise<string>,
  reportReady: (report: SmokeReport) => ipcRenderer.send(IPC_CHANNELS.ready, report),
  setFullScreen: (on: boolean) => ipcRenderer.invoke(IPC_CHANNELS.fullScreen, on) as Promise<boolean>,
};

contextBridge.exposeInMainWorld('latigoDesktop', bridge);
