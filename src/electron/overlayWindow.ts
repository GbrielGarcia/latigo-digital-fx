import { BrowserWindow, type Rectangle } from 'electron';
import type { OverlayPort } from '../desktop/desktopController';
import type { OverlayCommand } from '../desktop/protocol';
import { IPC_CHANNELS } from '../shared/bridge';

/**
 * OverlayWindowManager: a single, reusable, borderless, transparent,
 * always-on-top window that covers one display and renders only the whip.
 * Clicks pass through to the applications below while `clickThrough` is on.
 * The window is never recreated per strike.
 */
export class OverlayWindowManager implements OverlayPort {
  win: BrowserWindow | null = null;
  clickThrough = true;
  ready = false;
  private pendingCommands: OverlayCommand[] = [];

  constructor(
    private readonly preloadPath: string,
    private readonly htmlPath: string,
    private readonly getBounds: () => Rectangle,
  ) {}

  get exists(): boolean {
    return this.win !== null && !this.win.isDestroyed();
  }

  get visible(): boolean {
    return this.exists && this.win!.isVisible();
  }

  create(): void {
    if (this.exists) return;
    const bounds = this.getBounds();
    const isMac = process.platform === 'darwin';
    const win = new BrowserWindow({
      ...bounds,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      closable: true,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      enableLargerThanScreen: true,
      roundedCorners: false,
      // NSPanel on macOS: floats over full-screen spaces without stealing focus.
      ...(isMac ? { type: 'panel' } : {}),
      title: 'Látigo Digital FX — superposición',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
        additionalArguments: ['--latigo-role=overlay'],
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    if (isMac) {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      win.setHiddenInMissionControl(true);
    }
    win.setIgnoreMouseEvents(this.clickThrough);
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => {
      this.win = null;
      this.ready = false;
    });
    this.win = win;
    this.ready = false;
    void win.loadFile(this.htmlPath);
  }

  /** Called when the overlay renderer reports it is ready to receive commands. */
  markReady(): void {
    this.ready = true;
    for (const cmd of this.pendingCommands.splice(0)) this.command(cmd);
  }

  show(): void {
    if (!this.exists) return;
    // Never steal focus from the user's application.
    if (!this.win!.isVisible()) this.win!.showInactive();
  }

  hide(): void {
    if (this.exists && this.win!.isVisible()) this.win!.hide();
  }

  destroy(): void {
    if (this.exists) this.win!.destroy();
    this.win = null;
    this.ready = false;
    this.pendingCommands = [];
  }

  /** Re-fits the overlay to a display (monitor change, resolution change). */
  setBounds(bounds: Rectangle): void {
    if (!this.exists) return;
    const current = this.win!.getBounds();
    if (
      current.x !== bounds.x ||
      current.y !== bounds.y ||
      current.width !== bounds.width ||
      current.height !== bounds.height
    ) {
      this.win!.setBounds(bounds, false);
    }
  }

  setClickThrough(on: boolean): void {
    const changed = on !== this.clickThrough;
    this.clickThrough = on;
    if (!this.exists) return;
    const win = this.win!;
    win.setIgnoreMouseEvents(on);
    // Interactive mode needs keyboard focus for Esc; click-through mode never takes focus.
    win.setFocusable(!on);
    if (!on && win.isVisible()) win.focus();
    if (changed || !on) this.command({ type: 'interactive', on: !on });
  }

  command(cmd: OverlayCommand): void {
    if (!this.exists) return;
    if (!this.ready) {
      if (this.pendingCommands.length < 16) this.pendingCommands.push(cmd);
      return;
    }
    this.win!.webContents.send(IPC_CHANNELS.overlayCommand, cmd);
  }

  sendCursor(x: number, y: number): void {
    if (this.ready && this.exists) this.win!.webContents.send(IPC_CHANNELS.overlayCursor, x, y);
  }

  isFromOverlay(webContentsId: number): boolean {
    return this.exists && this.win!.webContents.id === webContentsId;
  }
}
