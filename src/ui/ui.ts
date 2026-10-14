import { RANGES, type Settings, type ThemeId } from '../config/settings';
import { PHASE_LABELS, type WhipPhase } from '../core/whip/phaseMachine';
import { THEMES } from '../render/themes';

export interface UiCallbacks {
  onSetting(path: string, value: string | number | boolean): void;
  onStrike(): void;
  onPause(): void;
  onReset(): void;
  onMute(): void;
  onHelp(): void;
  onFullscreen(): void;
  onTogglePanels(): void;
  onToggleSettingsPanel(): void;
  onRestoreDefaults(): void;
}

type RangeKey = keyof typeof RANGES;

const PERCENT_KEYS = new Set<string>([
  'flexibility',
  'damping',
  'sensitivity',
  'volume',
  'effectsIntensity',
  'trail',
  'particles',
]);

export function formatSettingValue(key: string, value: number): string {
  if (key === 'length') return `${value.toFixed(2)} m`;
  if (key === 'nodeCount') return String(Math.round(value));
  if (key === 'force' || key === 'thickness' || key === 'slowMotionScale') return `${value.toFixed(2)}×`;
  if (PERCENT_KEYS.has(key)) return `${Math.round(value * 100)} %`;
  return String(value);
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} no encontrado`);
  return el as T;
}

function readPath(settings: Settings, path: string): unknown {
  const [a, b] = path.split('.');
  const first = (settings as unknown as Record<string, unknown>)[a];
  if (b === undefined) return first;
  return (first as Record<string, unknown> | undefined)?.[b];
}

/**
 * DOM bindings for the Spanish user interface. Generic `data-setting`
 * attributes connect form controls to settings paths.
 */
export class Ui {
  private readonly app = byId<HTMLDivElement>('app');
  private readonly panel = byId<HTMLElement>('settings-panel');
  private readonly help = byId<HTMLDialogElement>('help-dialog');
  private readonly phaseChip = byId<HTMLDivElement>('phase-chip');
  private readonly crackCount = byId<HTMLElement>('crack-count');
  private readonly hint = byId<HTMLParagraphElement>('hint');
  private readonly labPanel = byId<HTMLElement>('lab-panel');
  private readonly labStats = byId<HTMLDListElement>('lab-stats');
  private readonly trainingPanel = byId<HTMLElement>('training-panel');
  private readonly pausedBadge = byId<HTMLElement>('paused-badge');
  private readonly showButton = byId<HTMLButtonElement>('btn-show');
  private readonly toastEl = byId<HTMLDivElement>('toast');
  private readonly labCells = new Map<string, HTMLElement>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPhase: WhipPhase | null = null;
  private lastHint = '';

  constructor(private readonly cb: UiCallbacks) {
    this.bindControls();
    this.bindButtons();
    this.trackTopbarHeight();
  }

  /** Keeps overlays below the top bar, which may wrap on narrow windows. */
  private trackTopbarHeight(): void {
    const topbar = byId<HTMLElement>('topbar');
    const apply = () =>
      document.documentElement.style.setProperty('--topbar-h', `${Math.ceil(topbar.offsetHeight)}px`);
    apply();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(topbar);
  }

  private bindControls(): void {
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]')) {
      const path = el.dataset.setting as string;
      if (el instanceof HTMLInputElement && el.type === 'range') {
        const range = RANGES[path as RangeKey];
        if (range) {
          el.min = String(range.min);
          el.max = String(range.max);
          el.step = String(range.step);
        }
        el.addEventListener('input', () => {
          const value = Number(el.value);
          this.updateOutput(path, value);
          this.cb.onSetting(path, value);
        });
      } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.addEventListener('change', () => this.cb.onSetting(path, el.checked));
      } else if (el instanceof HTMLInputElement && el.type === 'color') {
        el.addEventListener('input', () => this.cb.onSetting(path, el.value));
      } else {
        el.addEventListener('change', () => this.cb.onSetting(path, el.value));
      }
    }
    for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-clear]')) {
      btn.addEventListener('click', () => this.cb.onSetting(btn.dataset.clear as string, ''));
    }
  }

  private bindButtons(): void {
    const bind = (id: string, fn: () => void) => {
      const btn = byId<HTMLButtonElement>(id);
      btn.addEventListener('click', (e) => {
        fn();
        // Mouse clicks should not leave focus on the button, so that the
        // Space shortcut keeps striking instead of re-clicking the button.
        if (e.detail > 0) btn.blur();
      });
    };
    bind('btn-strike', () => this.cb.onStrike());
    bind('btn-pause', () => this.cb.onPause());
    bind('btn-reset', () => this.cb.onReset());
    bind('btn-mute', () => this.cb.onMute());
    bind('btn-help', () => this.cb.onHelp());
    bind('btn-fullscreen', () => this.cb.onFullscreen());
    bind('btn-hide', () => this.cb.onTogglePanels());
    bind('btn-show', () => this.cb.onTogglePanels());
    bind('btn-settings', () => this.cb.onToggleSettingsPanel());
    bind('btn-defaults', () => this.cb.onRestoreDefaults());
    bind('help-close', () => this.closeHelp());
    this.help.addEventListener('close', () => document.getElementById('stage')?.focus());
  }

  private updateOutput(path: string, value: number): void {
    const out = document.querySelector<HTMLOutputElement>(`output[data-for="${path}"]`);
    if (out) out.value = formatSettingValue(path, value);
  }

  syncFromSettings(settings: Settings): void {
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]')) {
      const path = el.dataset.setting as string;
      const value = readPath(settings, path);
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.checked = Boolean(value);
      } else if (el instanceof HTMLInputElement && el.type === 'color') {
        const fallback = path === 'handleColor' ? THEMES[settings.theme].handle : THEMES[settings.theme].rope;
        el.value = typeof value === 'string' && value !== '' ? value : fallback;
      } else {
        el.value = String(value);
        if (el instanceof HTMLInputElement && el.type === 'range') this.updateOutput(path, Number(value));
      }
    }
    this.setMuted(settings.muted);
    this.setTheme(settings.theme);
    this.setPanelsVisible(settings.panelsVisible);
  }

  setTheme(theme: ThemeId): void {
    document.documentElement.dataset.theme = theme;
  }

  setPaused(paused: boolean): void {
    const btn = byId<HTMLButtonElement>('btn-pause');
    btn.setAttribute('aria-pressed', String(paused));
    btn.textContent = paused ? 'Reanudar' : 'Pausa';
    this.pausedBadge.hidden = !paused;
  }

  setMuted(muted: boolean): void {
    const btn = byId<HTMLButtonElement>('btn-mute');
    btn.setAttribute('aria-pressed', String(muted));
    btn.textContent = muted ? 'Activar sonido' : 'Silenciar';
  }

  setPhase(phase: WhipPhase): void {
    if (phase === this.lastPhase) return;
    this.lastPhase = phase;
    this.phaseChip.dataset.phase = phase;
    this.phaseChip.textContent = PHASE_LABELS[phase];
  }

  setPhaseVisible(visible: boolean): void {
    this.phaseChip.hidden = !visible;
  }

  setCrackCount(count: number): void {
    const text = String(count);
    if (this.crackCount.textContent !== text) this.crackCount.textContent = text;
  }

  setHint(text: string): void {
    if (text === this.lastHint) return;
    this.lastHint = text;
    this.hint.textContent = text;
  }

  showLab(visible: boolean): void {
    this.labPanel.hidden = !visible;
  }

  updateLab(rows: [string, string][]): void {
    for (const [label, value] of rows) {
      let cell = this.labCells.get(label);
      if (!cell) {
        const dt = document.createElement('dt');
        dt.textContent = label;
        cell = document.createElement('dd');
        this.labStats.append(dt, cell);
        this.labCells.set(label, cell);
      }
      if (cell.textContent !== value) cell.textContent = value;
    }
  }

  showTraining(visible: boolean): void {
    this.trainingPanel.hidden = !visible;
  }

  updateTraining(hits: number, attempts: number, streak: number, best: number): void {
    byId('train-hits').textContent = `${hits} / ${attempts}`;
    byId('train-streak').textContent = String(streak);
    byId('train-best').textContent = `${Math.round(best * 100)} %`;
  }

  setPanelsVisible(visible: boolean): void {
    this.app.classList.toggle('panels-hidden', !visible);
    this.showButton.hidden = visible;
  }

  get settingsOpen(): boolean {
    return !this.panel.hidden;
  }

  setSettingsOpen(open: boolean): void {
    this.panel.hidden = !open;
    byId('btn-settings').setAttribute('aria-expanded', String(open));
  }

  get helpOpen(): boolean {
    return this.help.open;
  }

  openHelp(): void {
    if (!this.help.open) this.help.showModal();
  }

  closeHelp(): void {
    if (this.help.open) this.help.close();
  }

  setSettingsLocation(text: string): void {
    byId('settings-location').textContent = text ? `Preferencias: ${text}` : '';
  }

  toast(message: string, ms = 2600): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('visible'), ms);
  }
}
