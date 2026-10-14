import { parseSettings, serializeSettings, type LoadResult, type Settings } from '../config/settings';

const STORAGE_KEY = 'latigo-digital-fx.settings';

/**
 * Loads and saves settings through the desktop bridge (user data directory)
 * or, in a plain browser, through localStorage. Saving is debounced so slider
 * drags do not hammer the disk.
 */
export class SettingsPersistence {
  private timer: ReturnType<typeof setTimeout> | null = null;
  lastError = '';

  async load(): Promise<LoadResult> {
    try {
      const bridge = window.latigoDesktop;
      const raw = bridge ? await bridge.loadSettings() : readLocal();
      return parseSettings(raw);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return parseSettings(null);
    }
  }

  scheduleSave(settings: Settings, delayMs = 400): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.saveNow(settings);
    }, delayMs);
  }

  async saveNow(settings: Settings): Promise<boolean> {
    const text = serializeSettings(settings);
    try {
      const bridge = window.latigoDesktop;
      if (bridge) return await bridge.saveSettings(text);
      localStorage.setItem(STORAGE_KEY, text);
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  async location(): Promise<string> {
    const bridge = window.latigoDesktop;
    if (bridge) {
      try {
        return await bridge.settingsLocation();
      } catch {
        return '';
      }
    }
    return 'localStorage (navegador)';
  }
}

function readLocal(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
