/**
 * Translates DOM pointer and keyboard events into application intents.
 * Pointer coordinates are reported in CSS pixels relative to the canvas.
 * Keyboard shortcuts are ignored while a form control has focus, so they never
 * fight with native control behaviour (e.g. Space on a focused button).
 */
export interface InputIntents {
  pointerMove(x: number, y: number): void;
  pointerDown(x: number, y: number): void;
  pointerUp(x: number, y: number): void;
  pointerCancel(): void;
  strike(): void;
  reset(): void;
  togglePause(): void;
  toggleMute(): void;
  toggleHelp(): void;
  toggleLab(): void;
  toggleFullscreen(): void;
  togglePanels(): void;
  escape(): void;
  userActivity(): void;
}

const INTERACTIVE_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'A']);

export function isFormControl(el: Element | null): boolean {
  if (!el) return false;
  if (INTERACTIVE_TAGS.has(el.tagName)) return true;
  return (el as HTMLElement).isContentEditable === true;
}

export class InputController {
  private activePointer: number | null = null;
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly intents: InputIntents,
  ) {
    this.listen(canvas, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.listen(canvas, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.listen(canvas, 'pointerup', (e) => this.onPointerUp(e as PointerEvent));
    this.listen(canvas, 'pointercancel', () => this.cancel());
    this.listen(canvas, 'lostpointercapture', () => this.cancel());
    this.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    this.listen(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(window, 'blur', () => this.cancel());
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn, { passive: false });
    this.disposers.push(() => target.removeEventListener(type, fn));
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.activePointer !== null && e.pointerId !== this.activePointer) return;
    const p = this.local(e);
    this.intents.userActivity();
    this.intents.pointerMove(p.x, p.y);
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || this.activePointer !== null) return;
    e.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this.activePointer = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is best effort (synthetic events cannot be captured).
    }
    const p = this.local(e);
    this.intents.userActivity();
    this.intents.pointerDown(p.x, p.y);
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.activePointer) return;
    this.activePointer = null;
    const p = this.local(e);
    this.intents.userActivity();
    this.intents.pointerUp(p.x, p.y);
  }

  private cancel(): void {
    if (this.activePointer === null) return;
    this.activePointer = null;
    this.intents.pointerCancel();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.intents.escape();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave system shortcuts alone
    if (isFormControl(document.activeElement)) return;
    if (document.querySelector('dialog[open]') && e.key !== 'h' && e.key !== 'H' && e.key !== 'F1') return;
    let handled = true;
    switch (e.key) {
      case ' ':
        if (!e.repeat) this.intents.strike();
        break;
      case 'r':
      case 'R':
        this.intents.reset();
        break;
      case 'p':
      case 'P':
        this.intents.togglePause();
        break;
      case 'm':
      case 'M':
        this.intents.toggleMute();
        break;
      case 'h':
      case 'H':
      case 'F1':
        this.intents.toggleHelp();
        break;
      case 'l':
      case 'L':
        this.intents.toggleLab();
        break;
      case 'f':
      case 'F':
        this.intents.toggleFullscreen();
        break;
      case 'o':
      case 'O':
        this.intents.togglePanels();
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      this.intents.userActivity();
    }
  }

  dispose(): void {
    for (const d of this.disposers.splice(0)) d();
  }
}
