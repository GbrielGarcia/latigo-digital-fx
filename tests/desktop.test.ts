import { describe, expect, it } from 'vitest';
import {
  cloneDefaults,
  DEFAULT_SETTINGS,
  parseSettings,
  validateSettings,
  type Settings,
} from '../src/config/settings';
import {
  acceleratorFromKeyEvent,
  DEFAULT_SHORTCUTS,
  findDuplicateShortcuts,
  formatAccelerator,
  isValidAccelerator,
  normaliseAccelerator,
} from '../src/desktop/accelerators';
import { detectCapabilities } from '../src/desktop/capabilities';
import {
  DesktopCoordinateMapper,
  displayForPoint,
  virtualDesktopBounds,
  type DisplayInfo,
} from '../src/desktop/coordinateMapper';
import { DesktopController, type DesktopPorts } from '../src/desktop/desktopController';
import type { OverlayCommand } from '../src/desktop/protocol';
import { GlobalShortcutManager, type ShortcutRegistrar } from '../src/desktop/shortcutManager';

// Two monitors: a 1920×1080 primary and a Retina 1512×982 monitor to its LEFT (negative x).
const PRIMARY: DisplayInfo = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
const LEFT: DisplayInfo = { id: 2, bounds: { x: -1512, y: 98, width: 1512, height: 982 }, scaleFactor: 2 };

describe('DesktopCoordinateMapper', () => {
  it('maps global points to overlay-local coordinates on the primary display', () => {
    const m = new DesktopCoordinateMapper();
    m.setDisplays([PRIMARY, LEFT], 1);
    expect(m.map(100, 200, true)).toEqual({
      displayId: 1,
      x: 100,
      y: 200,
      clamped: false,
      displayChanged: false,
    });
  });

  it('handles negative coordinates and moves the overlay to the monitor under the cursor', () => {
    const m = new DesktopCoordinateMapper();
    m.setDisplays([PRIMARY, LEFT], 1);
    const p = m.map(-1000, 500, true);
    expect(p).toEqual({ displayId: 2, x: 512, y: 402, clamped: false, displayChanged: true });
    expect(m.currentDisplayId).toBe(2);
    // Moving back to the primary changes display again.
    expect(m.map(10, 10, true)?.displayChanged).toBe(true);
    expect(m.currentDisplayId).toBe(1);
  });

  it('clamps to the current display when multi-monitor tracking is off', () => {
    const m = new DesktopCoordinateMapper();
    m.setDisplays([PRIMARY, LEFT], 1);
    const p = m.map(-500, 300, false);
    expect(p).toMatchObject({ displayId: 1, x: 0, y: 300, clamped: true, displayChanged: false });
  });

  it('uses the nearest display for points in gaps between monitors', () => {
    expect(displayForPoint([PRIMARY, LEFT], -10, 20)?.id).toBe(1); // above LEFT's top edge (y < 98)
    expect(displayForPoint([PRIMARY, LEFT], -1600, 500)?.id).toBe(2);
  });

  it('falls back to the primary when the overlay display is unplugged', () => {
    const m = new DesktopCoordinateMapper();
    m.setDisplays([PRIMARY, LEFT], 1);
    m.map(-1000, 500, true);
    expect(m.currentDisplayId).toBe(2);
    m.setDisplays([PRIMARY], 1);
    expect(m.currentDisplayId).toBe(1);
    expect(m.map(-1000, 500, true)).toMatchObject({ displayId: 1, x: 0, clamped: true });
  });

  it('recovers after a resolution change', () => {
    const m = new DesktopCoordinateMapper();
    m.setDisplays([PRIMARY], 1);
    m.setDisplays([{ ...PRIMARY, bounds: { x: 0, y: 0, width: 1280, height: 720 } }], 1);
    expect(m.map(1900, 1000, true)).toMatchObject({ x: 1279, y: 719, clamped: true });
  });

  it('rejects non-finite points and computes the virtual desktop', () => {
    const m = new DesktopCoordinateMapper();
    m.setDisplays([PRIMARY, LEFT], 1);
    expect(m.map(Number.NaN, 0, true)).toBeNull();
    expect(virtualDesktopBounds([PRIMARY, LEFT])).toEqual({ x: -1512, y: 0, width: 3432, height: 1080 });
  });
});

describe('Accelerators', () => {
  it('accepts safe combinations and canonicalises them', () => {
    expect(normaliseAccelerator('shift+alt+cmdorctrl+j')).toBe('CommandOrControl+Alt+Shift+J');
    for (const acc of Object.values(DEFAULT_SHORTCUTS)) expect(isValidAccelerator(acc)).toBe(true);
    expect(isValidAccelerator('Control+F5')).toBe(true);
  });

  it('rejects unsafe or malformed combinations', () => {
    for (const bad of [
      'J',
      'Shift+J',
      'Space',
      'Ctrl+',
      'Ctrl+Ctrl+J',
      'Ctrl+Foo',
      'Hyper+J',
      '',
      42,
      null,
    ]) {
      expect(isValidAccelerator(bad), String(bad)).toBe(false);
    }
  });

  it('records shortcuts from key events per platform', () => {
    const ev = { code: 'KeyJ', metaKey: true, ctrlKey: false, altKey: true, shiftKey: true };
    expect(acceleratorFromKeyEvent(ev, 'darwin')).toBe('CommandOrControl+Alt+Shift+J');
    expect(acceleratorFromKeyEvent({ ...ev, metaKey: false, ctrlKey: true }, 'win32')).toBe(
      'CommandOrControl+Alt+Shift+J',
    );
    expect(acceleratorFromKeyEvent({ ...ev, metaKey: false, altKey: false }, 'darwin')).toBeNull(); // Shift only
    expect(acceleratorFromKeyEvent({ ...ev, code: 'ShiftLeft' }, 'darwin')).toBeNull();
  });

  it('formats for display and detects duplicates', () => {
    expect(formatAccelerator(DEFAULT_SHORTCUTS.strike, 'darwin')).toBe('⌘⌥⇧J');
    expect(formatAccelerator(DEFAULT_SHORTCUTS.strike, 'win32')).toBe('Ctrl+Alt+Shift+J');
    expect(findDuplicateShortcuts({ ...DEFAULT_SHORTCUTS, mute: DEFAULT_SHORTCUTS.strike }).sort()).toEqual([
      'mute',
      'strike',
    ]);
  });
});

class FakeRegistrar implements ShortcutRegistrar {
  registered = new Map<string, () => void>();
  /** Accelerators "owned by another application". */
  taken = new Set<string>();
  throwOn = new Set<string>();
  register(acc: string, cb: () => void): boolean {
    if (this.throwOn.has(acc)) throw new Error('conversion failed');
    if (this.taken.has(acc) || this.registered.has(acc)) return false;
    this.registered.set(acc, cb);
    return true;
  }
  unregister(acc: string): void {
    this.registered.delete(acc);
  }
  isRegistered(acc: string): boolean {
    return this.registered.has(acc);
  }
}

describe('GlobalShortcutManager', () => {
  it('registers, dispatches and releases shortcuts', () => {
    const reg = new FakeRegistrar();
    const fired: string[] = [];
    const mgr = new GlobalShortcutManager(reg, (a) => fired.push(a));
    const statuses = mgr.apply({ ...DEFAULT_SHORTCUTS });
    expect(statuses.every((s) => s.registered)).toBe(true);
    expect(reg.registered.size).toBe(4);
    reg.registered.get(DEFAULT_SHORTCUTS.strike)?.();
    expect(fired).toEqual(['strike']);
    mgr.releaseAll();
    expect(reg.registered.size).toBe(0);
  });

  it('reports shortcuts taken by other apps or refused by the OS, and keeps the rest', () => {
    const reg = new FakeRegistrar();
    reg.taken.add(DEFAULT_SHORTCUTS.pause);
    reg.throwOn.add(DEFAULT_SHORTCUTS.mute);
    const mgr = new GlobalShortcutManager(reg, () => undefined);
    const st = Object.fromEntries(mgr.apply({ ...DEFAULT_SHORTCUTS }).map((s) => [s.action, s]));
    expect(st.strike.registered).toBe(true);
    expect(st.pause.registered).toBe(false);
    expect(st.pause.error).toMatch(/otra aplicación/);
    expect(st.mute.registered).toBe(false);
    expect(st.mute.error).toMatch(/rechazó/);
    expect(mgr.registeredCount).toBe(2);
  });

  it('rejects invalid and duplicated combinations without registering them', () => {
    const reg = new FakeRegistrar();
    const mgr = new GlobalShortcutManager(reg, () => undefined);
    const st = mgr.apply({ ...DEFAULT_SHORTCUTS, toggle: 'K', mute: DEFAULT_SHORTCUTS.pause });
    expect(st.find((s) => s.action === 'toggle')?.registered).toBe(false);
    expect(st.filter((s) => s.error?.includes('repetida'))).toHaveLength(2);
    expect(reg.registered.size).toBe(1);
  });

  it('re-registers when the user changes a shortcut', () => {
    const reg = new FakeRegistrar();
    const mgr = new GlobalShortcutManager(reg, () => undefined);
    mgr.apply({ ...DEFAULT_SHORTCUTS });
    mgr.apply({ ...DEFAULT_SHORTCUTS, strike: 'Control+Alt+F9' });
    expect(reg.isRegistered('Control+Alt+F9')).toBe(true);
    expect(reg.isRegistered(DEFAULT_SHORTCUTS.strike)).toBe(false);
  });
});

function makeController(initial: Settings) {
  const log: string[] = [];
  const commands: OverlayCommand[] = [];
  const reg = new FakeRegistrar();
  let settings = initial;
  const overlay = {
    exists: false,
    visible: false,
    clickThrough: true,
    create() {
      this.exists = true;
      log.push('create');
    },
    show() {
      this.visible = true;
    },
    hide() {
      this.visible = false;
    },
    destroy() {
      this.exists = false;
      this.visible = false;
      log.push('destroy');
    },
    setClickThrough(on: boolean) {
      this.clickThrough = on;
    },
    command(cmd: OverlayCommand) {
      commands.push(cmd);
    },
  };
  const cursor = {
    active: false,
    start() {
      this.active = true;
    },
    stop() {
      this.active = false;
    },
  };
  const tray = {
    exists: false,
    update() {
      this.exists = true;
    },
    destroy() {
      this.exists = false;
    },
  };
  const ports: DesktopPorts = {
    overlay,
    cursor,
    tray,
    shortcuts: new GlobalShortcutManager(reg, (a) => controller.handle(a)),
    showSettings: () => log.push('showSettings'),
    quit: () => log.push('quit'),
  };
  const controller: DesktopController = new DesktopController(ports, (change) => {
    const draft = structuredClone(settings);
    change(draft);
    settings = validateSettings(draft).settings;
    controller.apply(settings);
  });
  controller.apply(settings);
  return {
    controller,
    overlay,
    cursor,
    tray,
    reg,
    commands,
    log,
    get settings() {
      return settings;
    },
  };
}

describe('DesktopController', () => {
  const enabled = () => {
    const s = cloneDefaults();
    s.desktop.enabled = true;
    return s;
  };

  it('keeps every OS resource released while desktop mode is off', () => {
    const c = makeController(cloneDefaults());
    expect(c.overlay.exists).toBe(false);
    expect(c.cursor.active).toBe(false);
    expect(c.tray.exists).toBe(false);
    expect(c.reg.registered.size).toBe(0);
  });

  it('activation creates one overlay, tracks the cursor, registers shortcuts and shows the tray', () => {
    const c = makeController(cloneDefaults());
    c.controller.handle('enable');
    expect(c.overlay.exists && c.overlay.visible).toBe(true);
    expect(c.overlay.clickThrough).toBe(true);
    expect(c.cursor.active).toBe(true);
    expect(c.tray.exists).toBe(true);
    expect(c.reg.registered.size).toBe(4);
    // Re-applying settings never creates a second overlay.
    c.controller.apply(c.settings);
    expect(c.log.filter((l) => l === 'create')).toHaveLength(1);
  });

  it('the strike shortcut asks the physics to strike (not an animation)', () => {
    const c = makeController(enabled());
    c.reg.registered.get(DEFAULT_SHORTCUTS.strike)?.();
    expect(c.commands).toContainEqual({ type: 'strike' });
  });

  it('toggle hides the overlay and stops cursor polling; toggling again restores it', () => {
    const c = makeController(enabled());
    c.reg.registered.get(DEFAULT_SHORTCUTS.toggle)?.();
    expect(c.overlay.visible).toBe(false);
    expect(c.cursor.active).toBe(false);
    expect(c.overlay.exists).toBe(true);
    expect(c.reg.registered.size).toBe(4); // still reachable by shortcut
    c.controller.handle('toggle');
    expect(c.overlay.visible).toBe(true);
    expect(c.cursor.active).toBe(true);
  });

  it('a strike while hidden shows the overlay first', () => {
    const s = enabled();
    s.desktop.overlayVisible = false;
    const c = makeController(s);
    c.controller.handle('strike');
    expect(c.overlay.visible).toBe(true);
    expect(c.commands.at(-1)).toEqual({ type: 'strike' });
  });

  it('pause freezes the overlay and stops polling; resume restarts it', () => {
    const c = makeController(enabled());
    c.controller.handle('pause');
    expect(c.controller.state.paused).toBe(true);
    expect(c.commands.at(-1)).toEqual({ type: 'pause', paused: true });
    expect(c.cursor.active).toBe(false);
    c.controller.handle('pause');
    expect(c.cursor.active).toBe(true);
    expect(c.commands.at(-1)).toEqual({ type: 'pause', paused: false });
  });

  it('mute flips the shared muted setting', () => {
    const c = makeController(enabled());
    c.controller.handle('mute');
    expect(c.settings.muted).toBe(true);
    expect(c.controller.state.muted).toBe(true);
    c.controller.handle('mute');
    expect(c.settings.muted).toBe(false);
  });

  it('click-through can be turned off for configuration and back on', () => {
    const c = makeController(enabled());
    c.controller.handle('clickThrough');
    expect(c.overlay.clickThrough).toBe(false);
    c.controller.handle('clickThrough');
    expect(c.overlay.clickThrough).toBe(true);
  });

  it('respects cursor following being disabled', () => {
    const s = enabled();
    s.desktop.followCursor = false;
    const c = makeController(s);
    expect(c.overlay.visible).toBe(true);
    expect(c.cursor.active).toBe(false);
  });

  it('deactivation and shutdown release everything', () => {
    const c = makeController(enabled());
    c.controller.handle('disable');
    expect(c.overlay.exists).toBe(false);
    expect(c.cursor.active).toBe(false);
    expect(c.tray.exists).toBe(false);
    expect(c.reg.registered.size).toBe(0);
    const d = makeController(enabled());
    d.controller.shutdown();
    expect(d.overlay.exists || d.cursor.active || d.tray.exists || d.reg.registered.size > 0).toBe(false);
  });

  it('ignores overlay actions while disabled but still allows enable, settings and quit', () => {
    const c = makeController(cloneDefaults());
    c.controller.handle('strike');
    c.controller.handle('pause');
    expect(c.commands).toHaveLength(0);
    c.controller.handle('showSettings');
    c.controller.handle('quit');
    expect(c.log).toEqual(['showSettings', 'quit']);
  });
});

describe('Platform capabilities', () => {
  it('reports full support on macOS and Windows', () => {
    for (const p of ['darwin', 'win32']) {
      const c = detectCapabilities(p, {});
      expect([c.transparentOverlay, c.clickThrough, c.globalCursor, c.globalShortcuts]).toEqual([
        'yes',
        'yes',
        'yes',
        'yes',
      ]);
    }
  });

  it('distinguishes X11 from Wayland and never over-promises on Wayland', () => {
    const x11 = detectCapabilities('linux', { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' });
    expect(x11.linuxSession).toBe('x11');
    expect(x11.globalCursor).toBe('yes');
    const wl = detectCapabilities('linux', { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' });
    expect(wl.linuxSession).toBe('wayland');
    expect(wl.globalCursor).toBe('partial');
    expect(wl.notes.join(' ')).toMatch(/Wayland/);
  });
});

describe('Settings migration to v2', () => {
  it('migrates v1 files without losing existing preferences', () => {
    const v1 = { ...structuredClone(DEFAULT_SETTINGS), version: 1, theme: 'neon', volume: 0.3 } as Record<
      string,
      unknown
    >;
    delete v1.desktop;
    const r = parseSettings(JSON.stringify(v1));
    expect(r.recovered).toBe(false);
    expect(r.settings.version).toBe(2);
    expect(r.settings.theme).toBe('neon');
    expect(r.settings.volume).toBe(0.3);
    expect(r.settings.desktop.enabled).toBe(false); // safe default
    expect(r.settings.desktop.shortcuts).toEqual(DEFAULT_SHORTCUTS);
  });

  it('validates the desktop section field by field', () => {
    const r = validateSettings({
      desktop: {
        enabled: true,
        clickThrough: 'no',
        effectsOpacity: 5,
        closeBehavior: 'explode',
        shortcuts: { strike: 'J', mute: 'ctrl+alt+m' },
      },
    });
    expect(r.recovered).toBe(true);
    expect(r.settings.desktop.enabled).toBe(true);
    expect(r.settings.desktop.clickThrough).toBe(true);
    expect(r.settings.desktop.effectsOpacity).toBe(1);
    expect(r.settings.desktop.closeBehavior).toBe('tray');
    expect(r.settings.desktop.shortcuts.strike).toBe(DEFAULT_SHORTCUTS.strike);
    expect(r.settings.desktop.shortcuts.mute).toBe('Control+Alt+M');
  });
});
