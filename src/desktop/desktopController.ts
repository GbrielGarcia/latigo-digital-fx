import type { Settings } from '../config/settings';
import type { DesktopAction, OverlayCommand } from './protocol';
import type { GlobalShortcutManager } from './shortcutManager';

/** Overlay window port (implemented with Electron in `src/electron/overlayWindow.ts`). */
export interface OverlayPort {
  readonly exists: boolean;
  readonly visible: boolean;
  create(): void;
  show(): void;
  hide(): void;
  destroy(): void;
  setClickThrough(on: boolean): void;
  command(cmd: OverlayCommand): void;
}

/** Global cursor feed (implemented in `src/electron/globalInput.ts`). */
export interface CursorPort {
  readonly active: boolean;
  start(): void;
  stop(): void;
}

export interface TrayPort {
  readonly exists: boolean;
  update(state: DesktopRuntimeState): void;
  destroy(): void;
}

export interface DesktopRuntimeState {
  enabled: boolean;
  overlayVisible: boolean;
  paused: boolean;
  muted: boolean;
  clickThrough: boolean;
}

export interface DesktopPorts {
  overlay: OverlayPort;
  cursor: CursorPort;
  tray: TrayPort;
  shortcuts: GlobalShortcutManager;
  showSettings(): void;
  quit(): void;
}

/**
 * Reconciles the desired «Modo escritorio» settings with the OS resources
 * (overlay window, cursor polling, global shortcuts, tray) and executes the
 * user's actions. Pure orchestration: every OS interaction goes through a port,
 * so the logic is unit-testable without Electron.
 *
 * Resource policy:
 *  - disabled            → no overlay, no polling, no shortcuts, no tray.
 *  - enabled + hidden    → overlay hidden (kept for instant re-show), no polling.
 *  - enabled + paused    → overlay visible but idle, no polling.
 *  - enabled + visible   → polling only when cursor following is on.
 */
export class DesktopController {
  paused = false;
  private settings: Settings | null = null;

  constructor(
    private readonly ports: DesktopPorts,
    /** Applies a change to the persisted settings (then calls `apply` again). */
    private readonly mutate: (change: (draft: Settings) => void) => void,
  ) {}

  get state(): DesktopRuntimeState {
    const d = this.settings?.desktop;
    return {
      enabled: !!d?.enabled,
      overlayVisible: !!d?.enabled && !!d.overlayVisible,
      paused: this.paused,
      muted: !!this.settings?.muted,
      clickThrough: d?.clickThrough ?? true,
    };
  }

  apply(settings: Settings): void {
    this.settings = settings;
    const d = settings.desktop;
    const { overlay, cursor, tray, shortcuts } = this.ports;

    if (!d.enabled) {
      cursor.stop();
      shortcuts.releaseAll();
      if (overlay.exists) overlay.destroy();
      tray.destroy();
      this.paused = false;
      return;
    }

    shortcuts.apply(d.shortcuts);
    if (!overlay.exists) overlay.create();
    overlay.setClickThrough(d.clickThrough);
    if (d.overlayVisible) overlay.show();
    else overlay.hide();

    const shouldTrack = d.overlayVisible && d.followCursor && !this.paused;
    if (shouldTrack && !cursor.active) cursor.start();
    if (!shouldTrack && cursor.active) cursor.stop();

    tray.update(this.state);
  }

  handle(action: DesktopAction): void {
    const s = this.settings;
    switch (action) {
      case 'enable':
        this.mutate((draft) => {
          draft.desktop.enabled = true;
          draft.desktop.overlayVisible = true;
        });
        return;
      case 'disable':
        this.mutate((draft) => {
          draft.desktop.enabled = false;
        });
        return;
      case 'showSettings':
        this.ports.showSettings();
        return;
      case 'quit':
        this.ports.quit();
        return;
      case 'mute':
        this.mutate((draft) => {
          draft.muted = !draft.muted;
        });
        return;
      default:
        break;
    }
    if (!s || !s.desktop.enabled) return;
    switch (action) {
      case 'toggle':
        this.mutate((draft) => {
          draft.desktop.overlayVisible = !draft.desktop.overlayVisible;
        });
        break;
      case 'clickThrough':
        this.mutate((draft) => {
          draft.desktop.clickThrough = !draft.desktop.clickThrough;
        });
        break;
      case 'pause':
        this.paused = !this.paused;
        this.ports.overlay.command({ type: 'pause', paused: this.paused });
        this.apply(s);
        break;
      case 'strike':
        if (!s.desktop.overlayVisible) {
          this.mutate((draft) => {
            draft.desktop.overlayVisible = true;
          });
        }
        if (this.paused) this.handle('pause');
        this.ports.overlay.command({ type: 'strike' });
        break;
      case 'reset':
        this.ports.overlay.command({ type: 'reset' });
        break;
    }
  }

  /** Releases every OS resource (used when quitting). */
  shutdown(): void {
    this.ports.cursor.stop();
    this.ports.shortcuts.releaseAll();
    if (this.ports.overlay.exists) this.ports.overlay.destroy();
    this.ports.tray.destroy();
  }
}
