import { app, BrowserWindow, ipcMain, Menu, session, shell, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import { IPC_CHANNELS, type SmokeReport } from '../shared/bridge';
import { SettingsFileStore } from './settingsStore';

const APP_NAME = 'Látigo Digital FX';
const isSmokeTest = process.argv.includes('--smoke-test');
const SMOKE_TIMEOUT_MS = 30_000;

app.setName(APP_NAME);
if (isSmokeTest) {
  // Isolated Chromium profile so a running instance can never block the check.
  app.setPath('userData', path.join(app.getPath('temp'), `latigo-digital-fx-smoke-${process.pid}`));
}

let mainWindow: BrowserWindow | null = null;
let store: SettingsFileStore | null = null;

function createWindow(): BrowserWindow {
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
      backgroundThrottling: !isSmokeTest,
      additionalArguments: isSmokeTest ? ['--latigo-smoke-test'] : [],
    },
  });

  win.once('ready-to-show', () => win.show());

  // The app is fully local: block any navigation and new windows.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return win;
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

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.loadSettings, () => store?.read() ?? null);
  ipcMain.handle(IPC_CHANNELS.saveSettings, (_event, serialized: unknown) =>
    typeof serialized === 'string' && store ? store.write(serialized) : false,
  );
  ipcMain.handle(IPC_CHANNELS.settingsLocation, () => store?.filePath ?? '');
  ipcMain.handle(IPC_CHANNELS.fullScreen, (event, on: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    win.setFullScreen(Boolean(on));
    return true;
  });
  ipcMain.on(IPC_CHANNELS.ready, (_event, report: SmokeReport) => {
    if (!isSmokeTest) return;
    process.stdout.write(`SMOKE_REPORT ${JSON.stringify(report)}\n`);
    app.exit(report && report.ok ? 0 : 1);
  });
}

if (!app.requestSingleInstanceLock() && !isSmokeTest) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    store = new SettingsFileStore(app.getPath('userData'));

    // Deny every permission request except fullscreen (no camera, mic, etc.).
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'fullscreen');
    });

    buildMenu();
    registerIpc();
    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    if (isSmokeTest) {
      setTimeout(() => {
        process.stdout.write('SMOKE_REPORT {"ok":false,"error":"timeout"}\n');
        app.exit(2);
      }, SMOKE_TIMEOUT_MS);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || isSmokeTest) app.quit();
  });
}
