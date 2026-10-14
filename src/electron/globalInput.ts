import { screen, type Display } from 'electron';
import { DesktopCoordinateMapper, type DisplayInfo } from '../desktop/coordinateMapper';
import type { CursorPort } from '../desktop/desktopController';
import type { OverlayWindowManager } from './overlayWindow';

export function toDisplayInfo(d: Display): DisplayInfo {
  return { id: d.id, bounds: { ...d.bounds }, scaleFactor: d.scaleFactor };
}

/**
 * GlobalInputManager: reads the global cursor position with the official
 * `screen.getCursorScreenPoint()` API (no keyboard or click capture, no extra
 * OS permission on macOS/Windows) at a bounded rate, and only while the
 * overlay needs it. Coordinates are converted by the DesktopCoordinateMapper.
 */
export class GlobalInputManager implements CursorPort {
  readonly mapper = new DesktopCoordinateMapper();
  multiMonitor = true;
  /** Polling interval in ms (60 Hz). Physics interpolates between samples. */
  readonly intervalMs = 16;
  samples = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastX = Number.NaN;
  private lastY = Number.NaN;

  /** `refreshDisplays()` must be called once the app is ready (screen API). */
  constructor(private readonly overlay: OverlayWindowManager) {}

  get active(): boolean {
    return this.timer !== null;
  }

  /** Re-reads the monitor layout (called on display add/remove/metrics change). */
  refreshDisplays(): void {
    const displays = screen.getAllDisplays().map(toDisplayInfo);
    this.mapper.setDisplays(displays, screen.getPrimaryDisplay().id);
    const current = this.mapper.currentDisplay;
    if (current) this.overlay.setBounds(current.bounds);
    this.lastX = this.lastY = Number.NaN;
  }

  /** Bounds of the display that should host the overlay. */
  currentBounds(): DisplayInfo['bounds'] {
    if (!this.multiMonitor) {
      this.mapper.currentDisplayId = this.mapper.primaryDisplayId;
    } else {
      // Start on the display where the cursor is.
      const p = screen.getCursorScreenPoint();
      this.mapper.map(p.x, p.y, true);
    }
    return this.mapper.currentDisplay?.bounds ?? screen.getPrimaryDisplay().bounds;
  }

  start(): void {
    if (this.timer) return;
    this.lastX = this.lastY = Number.NaN;
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  poll(): void {
    const p = screen.getCursorScreenPoint();
    if (p.x === this.lastX && p.y === this.lastY) return; // idle cursor: no IPC traffic
    this.lastX = p.x;
    this.lastY = p.y;
    const mapped = this.mapper.map(p.x, p.y, this.multiMonitor);
    if (!mapped) return;
    this.samples++;
    if (mapped.displayChanged) {
      const display = this.mapper.getDisplay(mapped.displayId);
      if (display) this.overlay.setBounds(display.bounds);
      this.overlay.command({ type: 'display', cursorX: mapped.x, cursorY: mapped.y });
      return;
    }
    this.overlay.sendCursor(mapped.x, mapped.y);
  }
}
