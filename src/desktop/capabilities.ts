/**
 * What the global desktop mode can do on the current platform. Pure: the
 * caller passes `process.platform` and the environment. Messages are Spanish
 * because they are shown in the UI.
 */
export type Support = 'yes' | 'partial' | 'no';

export interface PlatformCapabilities {
  platform: string;
  /** 'x11' | 'wayland' | 'unknown' on Linux, '' elsewhere. */
  linuxSession: string;
  transparentOverlay: Support;
  clickThrough: Support;
  globalCursor: Support;
  globalShortcuts: Support;
  tray: Support;
  notes: string[];
}

export function detectCapabilities(
  platform: string,
  env: Record<string, string | undefined>,
): PlatformCapabilities {
  if (platform === 'darwin') {
    return {
      platform,
      linuxSession: '',
      transparentOverlay: 'yes',
      clickThrough: 'yes',
      globalCursor: 'yes',
      globalShortcuts: 'yes',
      tray: 'yes',
      notes: [
        'macOS: la posición del cursor y los atajos globales usan APIs oficiales que no requieren permisos de Accesibilidad ni de Monitorización de entrada.',
        'Si otra aplicación ya usa una combinación, macOS no permite registrarla: elige otra en «Modo escritorio».',
      ],
    };
  }
  if (platform === 'win32') {
    return {
      platform,
      linuxSession: '',
      transparentOverlay: 'yes',
      clickThrough: 'yes',
      globalCursor: 'yes',
      globalShortcuts: 'yes',
      tray: 'yes',
      notes: [
        'Windows: los juegos o aplicaciones en pantalla completa exclusiva pueden dibujarse por encima de la superposición; usa el modo ventana sin bordes.',
      ],
    };
  }
  if (platform === 'linux') {
    const sessionType = (env.XDG_SESSION_TYPE ?? '').toLowerCase();
    const wayland = sessionType === 'wayland' || (!!env.WAYLAND_DISPLAY && sessionType !== 'x11');
    const x11 = !wayland && (sessionType === 'x11' || !!env.DISPLAY);
    if (wayland) {
      return {
        platform,
        linuxSession: 'wayland',
        transparentOverlay: 'partial',
        clickThrough: 'partial',
        globalCursor: 'partial',
        globalShortcuts: 'partial',
        tray: 'partial',
        notes: [
          'Wayland: por diseño, las aplicaciones no pueden leer el cursor fuera de sus ventanas; el látigo solo seguirá al cursor cuando esté sobre la superposición. Alternativa: desactiva el paso de clics (modo interactivo) o inicia la app en XWayland con --ozone-platform=x11.',
          'Wayland: los atajos globales dependen del portal GlobalShortcuts del compositor; si no se registran, usa el icono de la bandeja.',
          'La bandeja del sistema requiere soporte de StatusNotifierItem (en GNOME, la extensión AppIndicator).',
        ],
      };
    }
    return {
      platform,
      linuxSession: x11 ? 'x11' : 'unknown',
      transparentOverlay: x11 ? 'yes' : 'partial',
      clickThrough: x11 ? 'yes' : 'partial',
      globalCursor: x11 ? 'yes' : 'partial',
      globalShortcuts: x11 ? 'yes' : 'partial',
      tray: 'partial',
      notes: [
        'X11: la transparencia requiere un compositor activo (la mayoría de escritorios lo incluyen).',
        'La bandeja del sistema requiere soporte de StatusNotifierItem o de la bandeja XEmbed.',
      ],
    };
  }
  return {
    platform,
    linuxSession: '',
    transparentOverlay: 'no',
    clickThrough: 'no',
    globalCursor: 'no',
    globalShortcuts: 'no',
    tray: 'no',
    notes: ['Plataforma no compatible con el modo escritorio.'],
  };
}
