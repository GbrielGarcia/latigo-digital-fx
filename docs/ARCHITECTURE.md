# Architecture

## Layers

```
┌──────────────────────── Electron main process (src/electron) ────────────────────────┐
│ BrowserWindow (sandbox, contextIsolation, no Node in page)  · SettingsFileStore      │
│ IPC: settings:load / settings:save / settings:location / window:fullscreen / app:ready│
└───────────────▲──────────────────────────────────────────────────────────────────────┘
                │ preload.ts → window.latigoDesktop (DesktopBridge, src/shared/bridge.ts)
┌───────────────┴──────────── Renderer (src/renderer/main.ts) ─────────────────────────┐
│ LatigoApp (src/app/app.ts) — frame loop, routes data between subsystems              │
│   InputController ─▶ Simulation (core) ─▶ crack events ─┬─▶ AudioEngine (Web Audio)   │
│                                                         ├─▶ ImpactEffects / TipTrail  │
│                       Renderer (Canvas 2D) ◀────────────┘   Ui (DOM, Spanish)         │
│   SettingsPersistence ◀──▶ bridge or localStorage                                    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Desktop mode

See [DESKTOP_MODE.md](DESKTOP_MODE.md). The main process owns a single in-memory copy of the settings (persisted and broadcast to both windows), a pure `DesktopController` that reconciles them with OS resources through ports (`OverlayWindowManager`, `GlobalInputManager`, `GlobalShortcutManager`, `TrayManager`), and the overlay renderer (`src/overlay/overlayApp.ts`) reuses `Simulation`, `Renderer` (transparent mode), `ImpactEffects` and `AudioEngine`.

## Frame loop (`LatigoApp.frame`)

1. Measure real `frameDt`; update the demo director (demo mode).
2. `Simulation.frame(frameDt)` → `FixedStepper.advance` runs `n` fixed steps (time scaled in slow motion). Each step: strike driver → handle → rope integrate → anchor → constraint solve → health check → metrics → crack detector → phase machine.
3. Drain crack events → visual effects, audio (`SoundGate` filters duplicates), training scoring.
4. Update effects with the (scaled) frame time; push the interpolated tip into the trail.
5. Render with interpolation factor `alpha` between the previous and current physics states.
6. Update the HUD; lab statistics are refreshed every 8 frames.

Nothing in the loop awaits audio or I/O. Settings saves are debounced (400 ms) and asynchronous.

## Module responsibilities

| Area            | Module                                                                  | Notes                                                      |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| Physics engine  | `core/physics/*`                                                        | Pure; typed arrays; no allocation per step                 |
| Whip model      | `core/whip/whipModel.ts`, `params.ts`                                   | Handle + rope + quality presets                            |
| Event detection | `core/whip/crackDetector.ts`, `phaseMachine.ts`                         | Deterministic, frame-rate independent                      |
| Input           | `input/inputController.ts`                                              | Pointer capture, focus-aware shortcuts, blur cancels drags |
| Rendering       | `render/renderer.ts`, `camera.ts`, `spline.ts`, `themes.ts`             | Cached background, HiDPI transform                         |
| Visual effects  | `render/effects.ts`, `particles.ts`                                     | Fixed pools; everything decays                             |
| Audio           | `audio/*`                                                               | Pure synthesis + gate; Web Audio wrapper degrades to no-op |
| UI              | `ui/ui.ts`, `renderer/index.html`, `styles.css`                         | `data-setting` bindings, ARIA labels                       |
| Configuration   | `config/settings.ts`, `app/persistence.ts`, `electron/settingsStore.ts` | Validation never throws                                    |
| Diagnostics     | `diagnostics/frameStats.ts`, lab mode, `bench/`, smoke test             |                                                            |

## Rules

- `src/core` and `src/config` must not touch the DOM, audio, Electron, renderer or UI (enforced by ESLint).
- Code identifiers are English; user-facing text is Spanish.
- All buffers (particles, shockwaves, trail, pending events, audio voices, frame stats) have fixed upper bounds.
- The page has a strict Content-Security-Policy, cannot navigate, cannot open windows, and every permission request except fullscreen is denied.

## Bounded resources

| Resource                | Bound                               |
| ----------------------- | ----------------------------------- |
| Pending crack events    | 16 (oldest dropped, counted)        |
| Particles               | 96–512 by quality (ring-recycled)   |
| Shockwaves              | 10                                  |
| Trail samples           | 96                                  |
| Audio voices            | 6 concurrent, 80 ms minimum spacing |
| Physics steps per frame | 24                                  |
| Settings file           | 64 KiB                              |
