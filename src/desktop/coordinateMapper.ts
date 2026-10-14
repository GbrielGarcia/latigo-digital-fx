/**
 * DesktopCoordinateMapper: converts global desktop coordinates (Electron DIP
 * screen space, which can be negative for monitors left of / above the
 * primary one) into coordinates local to the overlay window, and decides on
 * which display the overlay should live. Pure — no Electron imports.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: number;
  /** Full display bounds in DIP (device-independent pixels). */
  bounds: Rect;
  /** Device pixels per DIP (2 on Retina, 1.25/1.5 on scaled Windows…). */
  scaleFactor: number;
}

export interface MappedPoint {
  displayId: number;
  /** Coordinates relative to the overlay window, in CSS pixels (= DIP). */
  x: number;
  y: number;
  /** True when the point is outside the overlay's display and was clamped. */
  clamped: boolean;
  /** True when the overlay should move to `displayId`. */
  displayChanged: boolean;
}

export function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

function distanceSqToRect(rect: Rect, x: number, y: number): number {
  const dx = x < rect.x ? rect.x - x : x >= rect.x + rect.width ? x - (rect.x + rect.width - 1) : 0;
  const dy = y < rect.y ? rect.y - y : y >= rect.y + rect.height ? y - (rect.y + rect.height - 1) : 0;
  return dx * dx + dy * dy;
}

/** Display containing the point, or the nearest one (points in gaps between monitors). */
export function displayForPoint(displays: readonly DisplayInfo[], x: number, y: number): DisplayInfo | null {
  if (displays.length === 0) return null;
  let best = displays[0];
  let bestDist = Infinity;
  for (const d of displays) {
    if (containsPoint(d.bounds, x, y)) return d;
    const dist = distanceSqToRect(d.bounds, x, y);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

/** Bounding box of every display (the virtual desktop). */
export function virtualDesktopBounds(displays: readonly DisplayInfo[]): Rect {
  if (displays.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of displays) {
    minX = Math.min(minX, d.bounds.x);
    minY = Math.min(minY, d.bounds.y);
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export class DesktopCoordinateMapper {
  private displays: DisplayInfo[] = [];
  /** Display currently hosting the overlay. */
  currentDisplayId: number | null = null;
  primaryDisplayId: number | null = null;

  /** Call on start-up and whenever displays are added, removed or rescaled. */
  setDisplays(displays: readonly DisplayInfo[], primaryId: number): void {
    this.displays = displays.map((d) => ({ ...d, bounds: { ...d.bounds } }));
    this.primaryDisplayId = primaryId;
    if (this.currentDisplayId === null || !this.displays.some((d) => d.id === this.currentDisplayId)) {
      // The overlay's display disappeared (unplugged): fall back to the primary.
      this.currentDisplayId = this.displays.some((d) => d.id === primaryId)
        ? primaryId
        : (this.displays[0]?.id ?? null);
    }
  }

  get displayCount(): number {
    return this.displays.length;
  }

  getDisplay(id: number | null): DisplayInfo | null {
    return this.displays.find((d) => d.id === id) ?? null;
  }

  get currentDisplay(): DisplayInfo | null {
    return this.getDisplay(this.currentDisplayId);
  }

  /**
   * Maps a global cursor position. With `followAcrossDisplays` the overlay
   * follows the cursor to the display it is on; otherwise the point is clamped
   * to the overlay's current display.
   */
  map(globalX: number, globalY: number, followAcrossDisplays: boolean): MappedPoint | null {
    if (!Number.isFinite(globalX) || !Number.isFinite(globalY)) return null;
    const current = this.currentDisplay;
    if (!current) return null;
    let target = current;
    let displayChanged = false;
    if (followAcrossDisplays && !containsPoint(current.bounds, globalX, globalY)) {
      const next = displayForPoint(this.displays, globalX, globalY);
      if (next && next.id !== current.id) {
        target = next;
        displayChanged = true;
        this.currentDisplayId = next.id;
      }
    }
    const b = target.bounds;
    const lx = globalX - b.x;
    const ly = globalY - b.y;
    const cx = Math.min(Math.max(lx, 0), b.width - 1);
    const cy = Math.min(Math.max(ly, 0), b.height - 1);
    return { displayId: target.id, x: cx, y: cy, clamped: cx !== lx || cy !== ly, displayChanged };
  }
}
