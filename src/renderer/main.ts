import { LatigoApp } from '../app/app';
import { SettingsPersistence } from '../app/persistence';
import type { SmokeReport } from '../shared/bridge';

async function boot(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('No se encontró el lienzo principal');
  const persistence = new SettingsPersistence();
  const loaded = await persistence.load();
  const app = new LatigoApp(canvas, loaded.settings, persistence);
  app.start();
  canvas.focus({ preventScroll: true });

  if (loaded.recovered) {
    app.ui.toast('La configuración guardada no era válida y se ha restablecido.', 4500);
    void persistence.saveNow(loaded.settings);
  }
  void persistence.location().then((where) => app.ui.setSettingsLocation(where));

  const bridge = window.latigoDesktop;
  // The desktop shell allows audio without a prior gesture.
  if (bridge) app.enableAudio();
  if (bridge?.isSmokeTest) runSmokeTest(app);
  // Exposed for debugging from the developer tools only.
  (window as unknown as { latigoApp?: LatigoApp }).latigoApp = app;
}

/** Automated start-up check used by `npm run smoke` and CI. */
function runSmokeTest(app: LatigoApp): void {
  const startSteps = app.sim.totalSteps;
  const startedAt = performance.now();
  let struck = false;
  const timer = setInterval(() => {
    // Wait until the frame loop is really running, then strike and observe.
    if (!struck && app.sim.time > 0.5) {
      app.sim.strike('upward', 1.3);
      struck = true;
    }
    const done = struck && app.sim.time > 2.5;
    const timedOut = performance.now() - startedAt > 20_000;
    if (!done && !timedOut) return;
    clearInterval(timer);
    const report: SmokeReport = {
      ok: done && app.sim.totalSteps > startSteps && app.sim.model.rope.isHealthy(),
      steps: app.sim.totalSteps - startSteps,
      cracks: app.sim.detector.count,
      audioStatus: app.audio.status,
      renderer: 'canvas2d',
      fps: Math.round(app.stats.fps),
    };
    window.latigoDesktop?.reportReady(report);
  }, 100);
}

boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.textContent = `No se pudo iniciar Látigo Digital FX: ${message}`;
  window.latigoDesktop?.reportReady({
    ok: false,
    steps: 0,
    cracks: 0,
    audioStatus: 'unknown',
    renderer: 'none',
    error: message,
  });
});
