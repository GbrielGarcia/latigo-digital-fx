import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  MAX_SETTINGS_SIZE,
  parseSettings,
  serializeSettings,
  validateSettings,
} from '../src/config/settings';
import { SettingsFileStore } from '../src/electron/settingsStore';

describe('Settings — loading and validation', () => {
  it('returns defaults when nothing is stored', () => {
    const r = parseSettings(null);
    expect(r.settings).toEqual(DEFAULT_SETTINGS);
    expect(r.recovered).toBe(false);
  });

  it('round-trips through serialisation', () => {
    const custom = {
      ...structuredClone(DEFAULT_SETTINGS),
      theme: 'neon' as const,
      volume: 0.25,
      muted: true,
      ropeColor: '#ff00aa',
      mode: 'lab' as const,
      accessibility: { reduceMotion: true, disableFlash: true, disableShake: false },
    };
    const r = parseSettings(serializeSettings(custom));
    expect(r.recovered).toBe(false);
    expect(r.settings).toEqual(custom);
  });

  it('recovers from corrupt JSON', () => {
    const r = parseSettings('{"theme": "neon", ');
    expect(r.recovered).toBe(true);
    expect(r.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('recovers from non-object JSON and oversized files', () => {
    expect(parseSettings('[1,2,3]').recovered).toBe(true);
    expect(parseSettings('42').recovered).toBe(true);
    const huge = parseSettings(' '.repeat(MAX_SETTINGS_SIZE + 1) + '{}');
    expect(huge.recovered).toBe(true);
    expect(huge.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps out-of-range numbers and rejects wrong types field by field', () => {
    const r = validateSettings({
      version: 1,
      volume: 7,
      length: -3,
      nodeCount: 33.6,
      force: 'strong',
      theme: 'pink',
      muted: 'yes',
      handleColor: 'red',
      ropeColor: '#ABCDEF',
      accessibility: { reduceMotion: true, disableFlash: 1 },
      evil: '<script>',
    });
    expect(r.recovered).toBe(true);
    expect(r.settings.volume).toBe(1);
    expect(r.settings.length).toBe(1);
    expect(r.settings.nodeCount).toBe(34);
    expect(r.settings.force).toBe(DEFAULT_SETTINGS.force);
    expect(r.settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(r.settings.muted).toBe(false);
    expect(r.settings.handleColor).toBe('');
    expect(r.settings.ropeColor).toBe('#abcdef');
    expect(r.settings.accessibility).toEqual({
      reduceMotion: true,
      disableFlash: false,
      disableShake: false,
    });
    expect('evil' in r.settings).toBe(false);
  });

  it('rejects NaN and Infinity', () => {
    const r = validateSettings({ volume: Number.NaN, force: Number.POSITIVE_INFINITY });
    expect(r.settings.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(r.settings.force).toBe(DEFAULT_SETTINGS.force);
  });

  it('migrates a missing version without flagging it as corrupt', () => {
    const r = validateSettings({ theme: 'light' });
    expect(r.settings.version).toBe(1);
    expect(r.settings.theme).toBe('light');
    expect(r.recovered).toBe(false);
  });

  it('never mutates the frozen defaults', () => {
    const r = parseSettings(null);
    r.settings.accessibility.reduceMotion = true;
    expect(DEFAULT_SETTINGS.accessibility.reduceMotion).toBe(false);
  });
});

describe('SettingsFileStore — user data directory', () => {
  const dirs: string[] = [];
  const tempStore = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latigo-test-'));
    dirs.push(dir);
    return new SettingsFileStore(dir);
  };

  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('returns null when no file exists, then saves and loads', () => {
    const store = tempStore();
    expect(store.read()).toBeNull();
    const text = serializeSettings(DEFAULT_SETTINGS);
    expect(store.write(text)).toBe(true);
    expect(store.read()).toBe(text);
    expect(fs.readdirSync(store.directory).filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
  });

  it('refuses invalid or oversized payloads', () => {
    const store = tempStore();
    expect(store.write('not json')).toBe(false);
    expect(store.write(`"${'x'.repeat(MAX_SETTINGS_SIZE)}"`)).toBe(false);
    expect(store.read()).toBeNull();
  });

  it('keeps a backup of a corrupt file and the app recovers defaults', () => {
    const store = tempStore();
    fs.writeFileSync(store.filePath, '{ corrupt');
    const raw = store.read();
    const backups = fs.readdirSync(store.directory).filter((f) => f.startsWith('settings.corrupt-'));
    expect(backups).toHaveLength(1);
    const r = parseSettings(raw);
    expect(r.recovered).toBe(true);
    expect(r.settings).toEqual(DEFAULT_SETTINGS);
    expect(store.write(serializeSettings(r.settings))).toBe(true);
    expect(parseSettings(store.read()).recovered).toBe(false);
  });
});
