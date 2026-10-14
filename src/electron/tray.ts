import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron';
import type { DesktopRuntimeState, TrayPort } from '../desktop/desktopController';
import type { DesktopAction } from '../desktop/protocol';

/**
 * TrayManager: icon in the system tray / macOS menu bar while the desktop mode
 * is enabled, so the user always sees that it is running and can stop it.
 */
export class TrayManager implements TrayPort {
  private tray: Tray | null = null;
  private lastKey = '';

  constructor(
    private readonly iconPath: string,
    private readonly onAction: (action: DesktopAction) => void,
  ) {}

  get exists(): boolean {
    return this.tray !== null && !this.tray.isDestroyed();
  }

  update(state: DesktopRuntimeState): void {
    if (!this.exists) {
      try {
        const image = nativeImage.createFromPath(this.iconPath).resize({ width: 18, height: 18 });
        this.tray = new Tray(image);
        this.tray.setToolTip('Látigo Digital FX');
        this.tray.on('click', () => {
          // Windows/Linux: a left click opens the settings window.
          if (process.platform !== 'darwin') this.onAction('showSettings');
        });
      } catch {
        // No tray available (e.g. some Wayland desktops): the app keeps working
        // from its window and global shortcuts.
        this.tray = null;
        return;
      }
      this.lastKey = '';
    }
    const key = JSON.stringify(state);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const item = (label: string, action: DesktopAction, extra: Partial<MenuItemConstructorOptions> = {}) => ({
      label,
      click: () => this.onAction(action),
      ...extra,
    });
    const template: MenuItemConstructorOptions[] = [
      { label: 'Látigo Digital FX', enabled: false },
      { type: 'separator' },
      item('Mostrar configuración', 'showSettings'),
      { type: 'separator' },
      item(state.overlayVisible ? 'Ocultar látigo' : 'Mostrar látigo', 'toggle'),
      item('Latigazo', 'strike'),
      item(state.paused ? 'Reanudar' : 'Pausar', 'pause'),
      item('Silenciar', 'mute', { type: 'checkbox', checked: state.muted }),
      item('Paso de clics', 'clickThrough', { type: 'checkbox', checked: state.clickThrough }),
      item('Restablecer látigo', 'reset'),
      { type: 'separator' },
      item('Desactivar modo escritorio', 'disable'),
      item('Salir de Látigo Digital FX', 'quit'),
    ];
    this.tray!.setContextMenu(Menu.buildFromTemplate(template));
  }

  destroy(): void {
    if (this.exists) this.tray!.destroy();
    this.tray = null;
    this.lastKey = '';
  }
}
