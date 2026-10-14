import { parseSettings } from '../config/settings';
import { OverlayApp } from '../overlay/overlayApp';

async function boot(): Promise<void> {
  const bridge = window.latigoDesktop;
  if (!bridge || bridge.role !== 'overlay') return; // only meaningful inside the desktop overlay
  const canvas = document.getElementById('overlay-stage') as HTMLCanvasElement;
  const banner = document.getElementById('interactive-banner') as HTMLElement;
  const raw = await bridge.loadSettings();
  const app = new OverlayApp(canvas, parseSettings(raw).settings, bridge, banner);
  document
    .getElementById('restore-click-through')
    ?.addEventListener('click', () => bridge.desktopAction('clickThrough'));
  window.addEventListener('beforeunload', () => app.dispose());
  app.start();
}

void boot();
