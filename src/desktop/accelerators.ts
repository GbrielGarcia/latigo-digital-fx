/**
 * Pure helpers for global shortcut accelerators (Electron accelerator syntax).
 * Global shortcuts must include a "real" modifier so they can never swallow
 * ordinary typing (letters, Shift+letter, Space…).
 */
export type ShortcutAction = 'strike' | 'toggle' | 'pause' | 'mute';

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = ['strike', 'toggle', 'pause', 'mute'];

export const SHORTCUT_LABELS: Readonly<Record<ShortcutAction, string>> = {
  strike: 'Latigazo',
  toggle: 'Mostrar u ocultar el látigo',
  pause: 'Pausar efectos',
  mute: 'Silenciar',
};

/** Three-modifier combinations: very unlikely to clash with common app shortcuts. */
export const DEFAULT_SHORTCUTS: Readonly<Record<ShortcutAction, string>> = {
  strike: 'CommandOrControl+Alt+Shift+J',
  toggle: 'CommandOrControl+Alt+Shift+K',
  pause: 'CommandOrControl+Alt+Shift+P',
  mute: 'CommandOrControl+Alt+Shift+M',
};

const MODIFIERS = new Map<string, string>([
  ['command', 'Command'],
  ['cmd', 'Command'],
  ['control', 'Control'],
  ['ctrl', 'Control'],
  ['commandorcontrol', 'CommandOrControl'],
  ['cmdorctrl', 'CommandOrControl'],
  ['alt', 'Alt'],
  ['option', 'Alt'],
  ['altgr', 'AltGr'],
  ['shift', 'Shift'],
  ['super', 'Super'],
  ['meta', 'Super'],
]);

/** Modifiers that make a combination safe for global registration. */
const STRONG_MODIFIERS = new Set(['Command', 'Control', 'CommandOrControl', 'Alt', 'Super']);

const NAMED_KEYS = new Set([
  'Space',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Return',
  'Enter',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Escape',
  'Esc',
  'Plus',
]);

function normaliseKey(raw: string): string | null {
  if (/^[a-z0-9]$/i.test(raw)) return raw.toUpperCase();
  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(raw)) return raw.toUpperCase();
  for (const named of NAMED_KEYS) if (named.toLowerCase() === raw.toLowerCase()) return named;
  if (/^[`~!@#$%^&*()\-_=[\]{}\\|;:'",.<>/?]$/.test(raw)) return raw;
  return null;
}

/** Parses and canonicalises an accelerator; returns null when invalid or unsafe. */
export function normaliseAccelerator(accelerator: unknown): string | null {
  if (typeof accelerator !== 'string') return null;
  const parts = accelerator
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  // "Plus" is the only way to bind the + key, so an empty part is invalid.
  if (parts.length < 2 || parts.length > 5 || accelerator.includes('++')) return null;
  const modifiers: string[] = [];
  for (const part of parts.slice(0, -1)) {
    const mod = MODIFIERS.get(part.toLowerCase());
    if (!mod || modifiers.includes(mod)) return null;
    modifiers.push(mod);
  }
  const key = normaliseKey(parts[parts.length - 1]);
  if (!key) return null;
  if (!modifiers.some((m) => STRONG_MODIFIERS.has(m))) return null;
  const order = ['CommandOrControl', 'Command', 'Control', 'Super', 'Alt', 'AltGr', 'Shift'];
  modifiers.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...modifiers, key].join('+');
}

export function isValidAccelerator(accelerator: unknown): boolean {
  return normaliseAccelerator(accelerator) !== null;
}

export interface KeyEventLike {
  code: string;
  key?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function keyFromCode(code: string): string | null {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit([0-9])$/.exec(code);
  if (m) return m[1];
  m = /^Numpad([0-9])$/.exec(code);
  if (m) return m[1];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  const map: Record<string, string> = {
    Space: 'Space',
    Enter: 'Return',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Backquote: '`',
  };
  return map[code] ?? null;
}

/**
 * Builds a portable accelerator from a keyboard event captured while the user
 * records a shortcut. Layout-independent (uses `code`). Returns null when only
 * modifiers are pressed or when the combination would be unsafe.
 */
export function acceleratorFromKeyEvent(event: KeyEventLike, platform: string): string | null {
  const key = keyFromCode(event.code);
  if (!key) return null;
  const mods: string[] = [];
  const isMac = platform === 'darwin';
  if (isMac ? event.metaKey : event.ctrlKey) mods.push('CommandOrControl');
  if (isMac && event.ctrlKey) mods.push('Control');
  if (!isMac && event.metaKey) mods.push('Super');
  if (event.altKey) mods.push('Alt');
  if (event.shiftKey) mods.push('Shift');
  return normaliseAccelerator([...mods, key].join('+'));
}

/** Human-readable label: ⌘⌥⇧J on macOS, Ctrl+Alt+Shift+J elsewhere. */
export function formatAccelerator(accelerator: string, platform: string): string {
  const norm = normaliseAccelerator(accelerator) ?? accelerator;
  const parts = norm.split('+');
  if (platform === 'darwin') {
    const sym: Record<string, string> = {
      CommandOrControl: '⌘',
      Command: '⌘',
      Control: '⌃',
      Alt: '⌥',
      Shift: '⇧',
      Super: '⌘',
    };
    return parts.map((p) => sym[p] ?? (p === 'Space' ? 'Espacio' : p)).join('');
  }
  const names: Record<string, string> = {
    CommandOrControl: 'Ctrl',
    Command: 'Ctrl',
    Control: 'Ctrl',
    Super: 'Win',
    Space: 'Espacio',
  };
  return parts.map((p) => names[p] ?? p).join('+');
}

/** Returns the actions whose accelerators collide with another action. */
export function findDuplicateShortcuts(map: Record<ShortcutAction, string>): ShortcutAction[] {
  const seen = new Map<string, ShortcutAction>();
  const dups = new Set<ShortcutAction>();
  for (const action of SHORTCUT_ACTIONS) {
    const norm = normaliseAccelerator(map[action]);
    if (!norm) continue;
    const other = seen.get(norm);
    if (other) {
      dups.add(other);
      dups.add(action);
    } else seen.set(norm, action);
  }
  return [...dups];
}
