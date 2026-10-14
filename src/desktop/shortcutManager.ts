import {
  findDuplicateShortcuts,
  normaliseAccelerator,
  SHORTCUT_ACTIONS,
  type ShortcutAction,
} from './accelerators';

/** Thin port over Electron's `globalShortcut`, injectable for tests. */
export interface ShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
  isRegistered(accelerator: string): boolean;
}

export interface ShortcutStatus {
  action: ShortcutAction;
  accelerator: string;
  registered: boolean;
  /** Spanish explanation when the shortcut could not be registered. */
  error?: string;
}

/**
 * GlobalShortcutManager: registers only the declared Látigo Digital FX
 * actions, reports failures (invalid, duplicated, taken by another app or
 * refused by the OS) and releases everything on demand.
 */
export class GlobalShortcutManager {
  private owned = new Map<ShortcutAction, string>();
  private lastApplied = '';
  statuses: ShortcutStatus[] = [];

  constructor(
    private readonly registrar: ShortcutRegistrar,
    private readonly onAction: (action: ShortcutAction) => void,
  ) {}

  /** Registers the given map, replacing previous registrations. Idempotent. */
  apply(map: Record<ShortcutAction, string>): ShortcutStatus[] {
    const key = JSON.stringify(map);
    if (key === this.lastApplied && this.owned.size > 0) return this.statuses;
    this.releaseAll();
    this.lastApplied = key;
    const duplicates = new Set(findDuplicateShortcuts(map));
    const statuses: ShortcutStatus[] = [];
    for (const action of SHORTCUT_ACTIONS) {
      const accelerator = normaliseAccelerator(map[action]);
      if (!accelerator) {
        statuses.push({
          action,
          accelerator: String(map[action] ?? ''),
          registered: false,
          error: 'Combinación no válida: usa al menos Ctrl/⌘, Alt/⌥ o Super y una tecla.',
        });
        continue;
      }
      if (duplicates.has(action)) {
        statuses.push({
          action,
          accelerator,
          registered: false,
          error: 'Combinación repetida en otra acción.',
        });
        continue;
      }
      let ok = false;
      let error: string | undefined;
      try {
        ok = this.registrar.register(accelerator, () => this.onAction(action));
      } catch (e) {
        error = `El sistema rechazó la combinación (${e instanceof Error ? e.message : String(e)}).`;
      }
      if (ok) this.owned.set(action, accelerator);
      else
        error ??=
          'No se pudo registrar: otra aplicación ya la usa o el sistema no permite atajos globales. Elige otra combinación o usa el icono de la bandeja.';
      statuses.push({ action, accelerator, registered: ok, error: ok ? undefined : error });
    }
    this.statuses = statuses;
    return statuses;
  }

  releaseAll(): void {
    for (const accelerator of this.owned.values()) {
      try {
        this.registrar.unregister(accelerator);
      } catch {
        // Unregistering is best effort.
      }
    }
    this.owned.clear();
    this.lastApplied = '';
    this.statuses = [];
  }

  get registeredCount(): number {
    return this.owned.size;
  }
}
