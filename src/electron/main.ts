import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
  type MenuItemConstructorOptions,
  type Rectangle,
} from 'electron';
import path from 'node:path';
import { parseSettings, serializeSettings, validateSettings, type Settings } from '../config/settings';
import { detectCapabilities } from '../desktop/capabilities';
import { DesktopController } from '../desktop/desktopController';
import { isDesktopAction, type DesktopStatus, type OverlayReport } from '../desktop/protocol';
import { GlobalShortcutManager } from '../desktop/shortcutManager';
import { IPC_CHANNELS, type SmokeReport } from '../shared/bridge';
import { GlobalInputManager } from './globalInput';
import { OverlayWindowManager } from './overlayWindow';
import { runDesktopSelfTest, type SelfTestContext } from './selfTest';
import { SettingsFileStore } from './settingsStore';
import { TrayManager } from './tray';

const APP_NAME = 'Látigo Digital FX';
const isSmokeTest = process.argv.includes('--smoke-test');
const isDesktopSelfTest = process.argv.includes('--desktop-self-test');
const isAutomated = isSmokeTest || isDesktopSelfTest;
const SMOKE_TIMEOUT_MS = 30_000;

app.setName(APP_NAME);
if (isAutomated) {
  // Isolated Chromium profile so a running instance can never block the check.
  app.setPath('userData', path.join(app.getPath('temp'), `latigo-digital-fx-test-${process.pid}`));
}

let mainWindow: BrowserWindow | null = null;
let store: SettingsFileStore | null = null;
let settings: Settings = parseSettings(null).settings;
let quitting = false;

const capabilities = detectCapabilities(process.platform, process.env);
const overlay: OverlayWindowManager = new OverlayWindowManager(
  path.join(__dirname, 'preload.cjs'),
  path.join(__dirname, '..', 'renderer', 'overlay.html'),
  (): Rectangle => input.currentBounds(),
);
const input: GlobalInputManager = new GlobalInputManager(overlay);
const tray = new TrayManager(path.join(__dirname, 'tray.png'), (action) => controller.handle(action));
const shortcuts = new GlobalShortcutManager(
  {
    register: (acc, cb) => globalShortcut.register(acc, cb),
    unregister: (acc) => globalShortcut.unregister(acc),
    isRegistered: (acc) => globalShortcut.isRegistered(acc),
  },
  (action) => controller.handle(action),
);
const controller = new DesktopController(
  {
    overlay,
    cursor: input,
    tray,
    shortcuts,
    showSettings: () => showMainWindow(),
    quit: () => app.quit(),
  },
  (change) => mutateSettings(change),
);

/** Overlay reports are also consumed by the self-test. */
const overlayListeners = new Set<(report: OverlayReport) => void>();

// ---- Settings hub (single source of truth shared by both windows) ----------

function broadcastSettings(exceptId?: number): void {
  const text = serializeSettings(settings);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.id === exceptId) continue;
    win.webContents.send(IPC_CHANNELS.settingsChanged, text);
  }
}

function desktopStatus(): DesktopStatus {
  const state = controller.state;
  return {
    supported: true,
    enabled: state.enabled,
    overlayVisible: state.overlayVisible && overlay.visible,
    paused: state.paused,
    clickThrough: state.clickThrough,
    cursorTracking: input.active,
    displays: input.mapper.displayCount,
    shortcuts: shortcuts.statuses,
    capabilities,
  };
}

function broadcastStatus(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.desktopStatusChanged, desktopStatus());
  }
}

function applyDesktop(): void {
  const multiChanged = input.multiMonitor !== settings.desktop.multiMonitor;
  input.multiMonitor = settings.desktop.multiMonitor;
  controller.apply(settings);
  if (multiChanged && overlay.exists) overlay.setBounds(input.currentBounds());
  // macOS: with the main window hidden, keep the app in the menu bar only.
  if (process.platform === 'darwin' && app.dock) {
    const mainVisible = !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
    if (mainVisible || !settings.desktop.enabled) void app.dock.show();
  }
  broadcastStatus();
}

/** Changes coming from the tray or a global shortcut: persist and notify windows. */
function mutateSettings(change: (draft: Settings) => void): void {
  const draft = structuredClone(settings);
  change(draft);
  settings = validateSettings(draft).settings;
  store?.write(serializeSettings(settings));
  broadcastSettings();
  applyDesktop();
}

// ---- Windows -----------------------------------------------------------------

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    title: APP_NAME,
    backgroundColor: '#0c0e12',
    show: false,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: !isAutomated,
      additionalArguments: isSmokeTest
        ? ['--latigo-smoke-test', '--latigo-role=main']
        : ['--latigo-role=main'],
    },
  });

  win.once('ready-to-show', () => win.show());

  // The app is fully local: block any navigation and new windows.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Closing the settings window keeps the desktop whip alive only when the
  // user chose "tray" in «Modo escritorio»; otherwise it quits the app.
  win.on('close', (event) => {
    if (quitting) return;
    if (settings.desktop.enabled && settings.desktop.closeBehavior === 'tray') {
      event.preventDefault();
      win.hide();
      if (process.platform === 'darwin') app.dock?.hide();
      broadcastStatus();
    }
  });
  win.on('closed', () => {
    mainWindow = null;
    if (!quitting) app.quit();
  });

  void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return win;
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow();
  if (process.platform === 'darwin') void app.dock?.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function buildMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'Ver',
      submenu: [
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        ...(app.isPackaged ? [] : ([{ role: 'toggleDevTools' }] as MenuItemConstructorOptions[])),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- IPC -----------------------------------------------------------------------

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.loadSettings, (event) => {
    // The overlay always gets the live in-memory settings; the main window gets
    // the raw file so it can tell the user when a corrupt file was repaired.
    if (overlay.isFromOverlay(event.sender.id)) return serializeSettings(settings);
    return store?.read() ?? null;
  });
  ipcMain.handle(IPC_CHANNELS.saveSettings, (_event, serialized: unknown) =>
    typeof serialized === 'string' && store ? store.write(serialized) : false,
  );
  ipcMain.on(IPC_CHANNELS.applySettings, (event, serialized: unknown) => {
    if (typeof serialized !== 'string') return;
    const result = parseSettings(serialized);
    settings = result.settings;
    broadcastSettings(event.sender.id);
    applyDesktop();
  });
  ipcMain.handle(IPC_CHANNELS.settingsLocation, () => store?.filePath ?? '');
  ipcMain.handle(IPC_CHANNELS.fullScreen, (event, on: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || overlay.isFromOverlay(event.sender.id)) return false;
    win.setFullScreen(Boolean(on));
    return true;
  });
  ipcMain.on(IPC_CHANNELS.desktopAction, (_event, action: unknown) => {
    if (isDesktopAction(action)) controller.handle(action);
  });
  ipcMain.handle(IPC_CHANNELS.desktopStatus, () => desktopStatus());
  ipcMain.on(IPC_CHANNELS.overlayReport, (event, report: OverlayReport) => {
    if (!overlay.isFromOverlay(event.sender.id) || !report || typeof report !== 'object') return;
    if (report.type === 'ready') {
      overlay.markReady();
      if (controller.paused) overlay.command({ type: 'pause', paused: true });
      overlay.command({ type: 'interactive', on: !overlay.clickThrough });
      broadcastStatus();
    }
    for (const listener of overlayListeners) listener(report);
  });
  ipcMain.on(IPC_CHANNELS.ready, (_event, report: SmokeReport) => {
    if (!isSmokeTest) return;
    process.stdout.write(`SMOKE_REPORT ${JSON.stringify(report)}\n`);
    app.exit(report && report.ok ? 0 : 1);
  });
}

function watchDisplays(): void {
  const refresh = () => {
    input.refreshDisplays();
    broadcastStatus();
  };
  screen.on('display-added', refresh);
  screen.on('display-removed', refresh);
  screen.on('display-metrics-changed', refresh);
}

// ---- Lifecycle -------------------------------------------------------------------

if (!isAutomated && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  void app.whenReady().then(() => {
    store = new SettingsFileStore(app.getPath('userData'));
    settings = parseSettings(store.read()).settings;
    if (isAutomated) settings.desktop.enabled = false; // tests start from a known state

    // Deny every permission request except fullscreen (no camera, mic, screen capture…).
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'fullscreen');
    });

    buildMenu();
    registerIpc();
    input.refreshDisplays();
    watchDisplays();
    mainWindow = createMainWindow();
    applyDesktop();

    if (isSmokeTest) {
      setTimeout(() => {
        process.stdout.write('SMOKE_REPORT {"ok":false,"error":"timeout"}\n');
        app.exit(2);
      }, SMOKE_TIMEOUT_MS);
    }

    if (isDesktopSelfTest) {
      const ctx: SelfTestContext = {
        get mainWindow() {
          return mainWindow;
        },
        get settings() {
          return settings;
        },
        overlay,
        input,
        tray,
        shortcuts,
        controller,
        capabilities,
        mutateSettings,
        onOverlayReport: (listener) => {
          overlayListeners.add(listener);
          return () => overlayListeners.delete(listener);
        },
        globalShortcutIsRegistered: (acc) => globalShortcut.isRegistered(acc),
        quit: () => app.quit(),
      };
      void runDesktopSelfTest(ctx);
    }

    app.on('activate', () => showMainWindow());
  });

  app.on('before-quit', () => {
    quitting = true;
    controller.shutdown();
  });

  app.on('will-quit', () => {
    // Make sure no global shortcut survives the process.
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
