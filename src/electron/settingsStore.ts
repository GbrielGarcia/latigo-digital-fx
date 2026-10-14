import fs from 'node:fs';
import path from 'node:path';
import { MAX_SETTINGS_SIZE } from '../config/settings';

/**
 * Settings file in the per-user data directory (Electron `userData`):
 *  - macOS:   ~/Library/Application Support/Látigo Digital FX/
 *  - Windows: %APPDATA%\Látigo Digital FX\
 *  - Linux:   ~/.config/Látigo Digital FX/
 * Writes are atomic (temp file + rename). Corrupt files are kept as a backup
 * copy before being replaced, so user data is never silently destroyed.
 */
export class SettingsFileStore {
  readonly filePath: string;

  constructor(
    readonly directory: string,
    fileName = 'settings.json',
  ) {
    this.filePath = path.join(directory, fileName);
  }

  read(): string | null {
    let raw: string;
    try {
      const stat = fs.statSync(this.filePath);
      if (stat.size > MAX_SETTINGS_SIZE) {
        this.backupCorrupt();
        return null;
      }
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch {
      return null;
    }
    try {
      JSON.parse(raw);
    } catch {
      this.backupCorrupt();
    }
    return raw;
  }

  write(serialized: string): boolean {
    if (typeof serialized !== 'string' || serialized.length > MAX_SETTINGS_SIZE) return false;
    try {
      JSON.parse(serialized);
    } catch {
      return false;
    }
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      fs.writeFileSync(tmp, serialized, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, this.filePath);
      return true;
    } catch {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        // ignore cleanup failures
      }
      return false;
    }
  }

  /** Copies the current (corrupt) file next to it with a timestamp. */
  backupCorrupt(): string | null {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(this.directory, `settings.corrupt-${stamp}.json`);
    try {
      fs.copyFileSync(this.filePath, target);
      return target;
    } catch {
      return null;
    }
  }
}
