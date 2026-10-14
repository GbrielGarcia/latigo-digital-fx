import { app, globalShortcut, screen, type BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import type { Settings } from '../config/settings';
import type { PlatformCapabilities } from '../desktop/capabilities';
import type { DesktopController } from '../desktop/desktopController';
import type { OverlayReport } from '../desktop/protocol';
import type { GlobalShortcutManager } from '../desktop/shortcutManager';
import { toDisplayInfo, type GlobalInputManager } from './globalInput';
import type { OverlayWindowManager } from './overlayWindow';
import type { TrayManager } from './tray';

export interface SelfTestContext {
  readonly mainWindow: BrowserWindow | null;
  readonly settings: Settings;
  overlay: OverlayWindowManager;
  input: GlobalInputManager;
  tray: TrayManager;
  shortcuts: GlobalShortcutManager;
  controller: DesktopController;
  capabilities: PlatformCapabilities;
  mutateSettings(change: (draft: Settings) => void): void;
  onOverlayReport(listener: (report: OverlayReport) => void): () => void;
  globalShortcutIsRegistered(accelerator: string): boolean;
  quit(): void;
}

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

type StatusReport = Extract<OverlayReport, { type: 'status' }>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Desktop-mode integration test executed inside the real Electron runtime on
 * the current OS (`npm run test:desktop`). It drives the real overlay window,
 * global shortcuts, cursor mapping, tray and quit path, then prints a JSON
 * report and exits with 0 only if every check passed.
 */
export async function runDesktopSelfTest(ctx: SelfTestContext): Promise<void> {
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail?: unknown) =>
    checks.push({ name, ok, detail: detail === undefined ? undefined : String(detail) });
  const watchdog = setTimeout(() => finish('timeout'), 90_000);
  let finished = false;

  const waitFor = <T extends OverlayReport>(
    pred: (r: OverlayReport) => r is T,
    ms = 8000,
  ): Promise<T | null> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        off();
        resolve(null);
      }, ms);
      const off = ctx.onOverlayReport((r) => {
        if (pred(r)) {
          clearTimeout(timer);
          off();
          resolve(r);
        }
      });
    });
  const isStatus = (r: OverlayReport): r is StatusReport => r.type === 'status';
  const status = async (): Promise<StatusReport | null> => {
    const p = waitFor(isStatus, 3000);
    ctx.overlay.command({ type: 'status' });
    return p;
  };

  function finish(reason?: string): void {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    if (reason) check('completed without timeout', false, reason);
    // Real quit path: before-quit → controller.shutdown(); then verify on will-quit.
    app.once('will-quit', (event) => {
      event.preventDefault();
      const leftovers = Object.values(ctx.settings.desktop.shortcuts).filter((acc) =>
        globalShortcut.isRegistered(acc),
      );
      check(
        'full quit releases overlay, cursor polling, tray and shortcuts',
        !ctx.overlay.exists && !ctx.input.active && !ctx.tray.exists && leftovers.length === 0,
        `overlay=${ctx.overlay.exists} polling=${ctx.input.active} tray=${ctx.tray.exists} shortcuts=${leftovers.length}`,
      );
      const ok = checks.every((c) => c.ok);
      process.stdout.write(
        `DESKTOP_SELFTEST ${JSON.stringify({ ok, platform: process.platform, capabilities: ctx.capabilities.linuxSession || process.platform, checks }, null, 1)}\n`,
      );
      app.exit(ok ? 0 : 1);
    });
    ctx.quit();
  }

  try {
    await sleep(1500); // let the main window load

    // 1. Activation and overlay initialisation.
    const ready = waitFor((r): r is Extract<OverlayReport, { type: 'ready' }> => r.type === 'ready', 10_000);
    ctx.controller.handle('enable');
    check('activation creates the overlay window', ctx.overlay.exists);
    check('overlay renderer becomes ready', (await ready) !== null);
    await sleep(500);
    const win = ctx.overlay.win!;
    check('overlay is visible', ctx.overlay.visible);
    // Inspect the overlay's OWN rendered pixels (never other applications).
    const shot = await win.webContents.capturePage();
    // Optional (development): save the overlay's own pixels for visual review.
    if (process.env.LATIGO_OVERLAY_SNAPSHOT) {
      writeFileSync(process.env.LATIGO_OVERLAY_SNAPSHOT, shot.toPNG());
    }
    const size = shot.getSize();
    const bitmap = shot.toBitmap();
    let opaque = 0;
    for (let k = 3; k < bitmap.length; k += 4) if (bitmap[k] > 8) opaque++;
    const coverage = opaque / Math.max(1, size.width * size.height);
    check(
      'overlay window is transparent outside the whip (pixel alpha)',
      bitmap.length > 0 && bitmap[3] === 0 && coverage < 0.05,
      `${(coverage * 100).toFixed(2)} % of ${size.width}×${size.height} px non-transparent; backgroundColor=${win.getBackgroundColor()}`,
    );
    check('overlay is always on top', win.isAlwaysOnTop());
    check('overlay does not take focus in click-through mode', !win.isFocusable());
    check('click-through is applied (setIgnoreMouseEvents)', ctx.overlay.clickThrough);
    const s1 = await status();
    check('overlay canvas is transparent (alpha, no opaque background)', !!s1?.transparent);

    // 2. Overlay covers the display under the cursor; coordinate conversion.
    const displays = screen.getAllDisplays().map(toDisplayInfo);
    const current = ctx.input.mapper.currentDisplay;
    const bounds = win.getBounds();
    check(
      'overlay covers its display',
      !!current &&
        bounds.x === current.bounds.x &&
        bounds.y === current.bounds.y &&
        bounds.width === current.bounds.width &&
        bounds.height === current.bounds.height,
      JSON.stringify({ bounds, display: current?.bounds }),
    );
    let mappingOk = true;
    for (const d of displays) {
      const cx = d.bounds.x + Math.floor(d.bounds.width / 2);
      const cy = d.bounds.y + Math.floor(d.bounds.height / 2);
      const m = ctx.input.mapper.map(cx, cy, true);
      if (
        !m ||
        m.displayId !== d.id ||
        m.x !== Math.floor(d.bounds.width / 2) ||
        m.y !== Math.floor(d.bounds.height / 2)
      ) {
        mappingOk = false;
      }
    }
    ctx.input.refreshDisplays();
    check(`global → local coordinate mapping on ${displays.length} display(s)`, mappingOk);
    if (displays.length < 2) check('multi-monitor movement (not testable: single display)', true, 'skipped');

    // 3. Global cursor tracking.
    check('global cursor polling is active', ctx.input.active);
    ctx.input.refreshDisplays();
    ctx.input.poll();
    check('cursor samples reach the overlay', ctx.input.samples > 0);

    // 4. Global shortcuts.
    const accs = Object.values(ctx.settings.desktop.shortcuts);
    check(
      'all global shortcuts registered',
      accs.every((a) => ctx.globalShortcutIsRegistered(a)),
      ctx.shortcuts.statuses
        .map((s) => `${s.action}:${s.registered}${s.error ? `(${s.error})` : ''}`)
        .join(' '),
    );

    // 5. Strike via the controller (same path as the global shortcut) → physics → sound.
    const crack = waitFor((r): r is Extract<OverlayReport, { type: 'crack' }> => r.type === 'crack', 5000);
    ctx.controller.handle('strike');
    const crackReport = await crack;
    check('strike request produces a physics crack event', crackReport !== null);
    await sleep(1500);
    const s2 = await status();
    check(
      'crack sounds equal crack events (audio synced, no duplicates)',
      !!s2 && s2.sounds === s2.cracks && s2.cracks > 0,
      JSON.stringify(s2),
    );
    check('overlay audio device running', s2?.audioStatus === 'running', s2?.audioStatus);

    // 6. Pause.
    ctx.controller.handle('pause');
    await sleep(200);
    const p1 = await status();
    await sleep(500);
    const p2 = await status();
    check('pause freezes the simulation', !!p1 && !!p2 && p1.paused && p2.steps === p1.steps);
    check('pause stops cursor polling', !ctx.input.active);
    ctx.controller.handle('pause');
    await sleep(300);
    const p3 = await status();
    check('resume continues the simulation', !!p3 && !p3.paused && !!p2 && p3.steps > p2.steps);

    // 7. Mute: cracks still happen, no sound.
    ctx.controller.handle('mute');
    await sleep(300);
    const m1 = await status();
    ctx.controller.handle('strike');
    await sleep(1800);
    const m2 = await status();
    check(
      'mute silences cracks without stopping physics',
      !!m1 && !!m2 && m2.muted && m2.cracks > m1.cracks && m2.sounds === m1.sounds,
      JSON.stringify({ m1, m2 }),
    );
    ctx.controller.handle('mute');

    // 8. Minimise / restore the main window: overlay keeps running.
    const main = ctx.mainWindow;
    if (main) {
      main.minimize();
      await sleep(800);
      const n1 = await status();
      await sleep(400);
      const n2 = await status();
      check(
        'overlay keeps running while the main window is minimised',
        ctx.overlay.visible && !!n1 && !!n2 && n2.steps > n1.steps,
      );
      main.restore();
      await sleep(500);
      check('main window restores', !main.isMinimized());
    }

    // 9. Interactive (non click-through) mode and back.
    ctx.controller.handle('clickThrough');
    await sleep(200);
    check('interactive mode makes the overlay focusable', win.isFocusable() && !ctx.overlay.clickThrough);
    ctx.controller.handle('clickThrough');
    await sleep(200);
    check('click-through mode restored', !win.isFocusable() && ctx.overlay.clickThrough);

    // 10. Toggle visibility.
    ctx.controller.handle('toggle');
    await sleep(300);
    check(
      'toggle hides the overlay and stops polling',
      !ctx.overlay.visible && !ctx.input.active && ctx.overlay.exists,
    );
    ctx.controller.handle('toggle');
    await sleep(300);
    check('toggle shows the overlay again', ctx.overlay.visible && ctx.input.active);

    // 11. Shortcut refused by the OS / taken by another app → reported, others kept.
    const taken = 'CommandOrControl+Alt+Shift+F12';
    const otherOwner = globalShortcut.register(taken, () => undefined);
    ctx.mutateSettings((d) => {
      d.desktop.shortcuts.strike = taken;
    });
    const strikeStatus = ctx.shortcuts.statuses.find((s) => s.action === 'strike');
    check(
      'a shortcut already in use is reported and the others keep working',
      otherOwner &&
        !!strikeStatus &&
        !strikeStatus.registered &&
        !!strikeStatus.error &&
        ctx.shortcuts.registeredCount === 3,
      strikeStatus?.error,
    );
    globalShortcut.unregister(taken);
    ctx.mutateSettings((d) => {
      d.desktop.shortcuts.strike = 'CommandOrControl+Alt+Shift+J';
    });
    check('shortcut registered again after choosing a free combination', ctx.shortcuts.registeredCount === 4);

    // 12. Settings window works and shows the desktop section.
    if (main) {
      const uiOk = (await main.webContents.executeJavaScript(
        "!!document.getElementById('desktop-section') && !!window.latigoApp && document.getElementById('desktop-status').textContent.length > 0",
      )) as boolean;
      check('settings window shows the «Modo escritorio» section and status', uiOk);
    }

    // 13. Closing the settings window with "tray" behaviour keeps the whip alive.
    if (main) {
      main.close();
      await sleep(400);
      check(
        'closing the settings window hides it (tray behaviour)',
        !main.isDestroyed() && !main.isVisible(),
      );
      const c1 = await status();
      check('overlay still alive after closing the settings window', ctx.overlay.visible && !!c1);
      ctx.controller.handle('showSettings');
      await sleep(400);
      check('tray action "Mostrar configuración" brings the window back', main.isVisible());
    }

    // 14. Deactivation releases everything.
    check(
      'tray icon present while enabled (if the platform supports it)',
      ctx.tray.exists || ctx.capabilities.tray !== 'yes',
    );
    ctx.controller.handle('disable');
    await sleep(300);
    check(
      'deactivation releases overlay, polling, shortcuts and tray',
      !ctx.overlay.exists && !ctx.input.active && ctx.shortcuts.registeredCount === 0 && !ctx.tray.exists,
    );
    check(
      'no global shortcut remains registered after deactivation',
      !accs.some((a) => globalShortcut.isRegistered(a)),
    );

    // 15. Re-enable, then quit completely through the real quit path.
    ctx.controller.handle('enable');
    await sleep(800);
    check('re-activation works', ctx.overlay.exists && ctx.shortcuts.registeredCount === 4);
  } catch (error) {
    check('self-test ran without exceptions', false, error instanceof Error ? error.stack : error);
  }
  finish();
}
