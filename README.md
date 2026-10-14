# Látigo Digital FX

**A desktop whip simulator with real-time rope physics, impact effects and sound triggered by the physics.**

> 🇪🇸 La documentación en español está en [README.es.md](README.es.md). The user interface is in Spanish.

Látigo Digital FX models a whip as a chain of point masses connected by constraints. You move the handle with the mouse or trackpad, wind up, release and watch a loop travel down the tapered rope until the tip outruns the hand and _cracks_. The crack sound, shockwave and sparks are fired by the simulation itself — not by the key you pressed.

![status](https://img.shields.io/badge/status-0.1.0%20preview-orange) ![license](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Dynamic rope model** — Verlet integration, iterative distance constraints, compression-only bending stiffness that fades towards the tip, tapered mass, air damping and speed caps.
- **Fixed-timestep physics** (120–360 Hz depending on quality) decoupled from rendering, with an accumulator, a per-frame step cap, pause recovery and render interpolation.
- **Crack detection** with hysteresis, peak detection and a refractory period → one event per physical crack, independent of frame rate.
- **Phase tracking** from the live state: rest, preparation, charge, acceleration, propagation, crack, recovery, cooldown.
- **Procedural audio** (no sample files): N-wave transient + band-passed snap + high-frequency sizzle + short tail, 8 seeded variants, pitch/gain/pan variation, swing whoosh, instant mute, duplicate and voice-count protection. Keeps running when no audio device is available.
- **Visuals**: tapered spline rope with highlight and braid texture, handle with grip and ferrule, frayed popper, motion trail, pooled particles, shockwaves, flash, camera shake, HiDPI rendering, three themes (_Oscuro profesional_, _Neón futurista_, _Minimalista claro_).
- **Modes**: free, practice (contextual hints), demo (autonomous, yields to the user), lab (FPS, sim rate, node count, handle/tip speed, energy, phase, crack count, audio status and latency, per-node speed overlay), slow motion, training (hit targets with the crack).
- **Settings** persisted in the OS user-data directory with validation, clamping, atomic writes and corrupt-file recovery (a backup copy is kept).
- **Accessibility**: full keyboard control, Spanish labels, reduce motion, disable flashes, disable shake, mute.
- **Privacy**: fully offline. No telemetry, no network requests, no global input hooks, no screen capture, no admin rights.

## Requirements

- Node.js **22 or newer** and npm (development only).
- macOS 11+ (Apple Silicon or Intel), Windows 10/11, or a modern Linux desktop (x64/arm64).

## Install and run (development)

```bash
npm install
npm start          # builds and launches the Electron app
```

Other useful scripts:

| Command                                        | Purpose                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                     | Unit + integration tests (Vitest, headless)                                                                          |
| `npm run check`                                | Typecheck + lint + format check + tests                                                                              |
| `npm run smoke`                                | Launches the real Electron app, performs a strike and reports (exits 0/1)                                            |
| `npm run bench`                                | Headless physics benchmark on this machine                                                                           |
| `npm run dev:web`                              | Serves the renderer at `http://127.0.0.1:5178` for quick UI work in a browser (settings fall back to `localStorage`) |
| `npm run pack:dir`                             | Unpacked app for the current OS in `release/`                                                                        |
| `npm run dist:mac` / `dist:win` / `dist:linux` | Installers/packages (`--publish never`)                                                                              |

See [docs/BUILDING.md](docs/BUILDING.md) for platform specifics, code signing and notarization.

## Controls

| Input                         | Action                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Move mouse / trackpad         | Move the handle; fast moves and sharp direction changes send waves down the rope         |
| Left click + drag             | Wind up (pull back) — charge accumulates                                                 |
| Release                       | Strike in the direction opposite to the drag                                             |
| `Space` / **Latigazo** button | Scripted strike (style: side, overhead, upward)                                          |
| `R`                           | Reset the whip                                                                           |
| `P`                           | Pause / resume                                                                           |
| `M`                           | Mute / unmute                                                                            |
| `L`                           | Toggle lab mode                                                                          |
| `F`                           | Fullscreen                                                                               |
| `O`                           | Hide / show panels                                                                       |
| `H` / `F1`                    | Help                                                                                     |
| `Esc`                         | Close help → cancel drag → leave fullscreen → show panels → close settings (never quits) |

Shortcuts are ignored while a form control has focus, so they never fight native control behaviour.

## Architecture

```
src/
  core/          Headless, pure TypeScript (no DOM / audio / Electron)
    math/        clamp, easing, seeded RNG
    physics/     Rope (Verlet + constraints), FixedStepper
    whip/        params & quality presets, WhipModel, CrackDetector,
                 PhaseMachine, StrikeDriver
    modes/       DemoDirector, TrainingSession
    simulation.ts  Ties physics, input intents, detection and phases
  config/        Settings schema, defaults, validation, (de)serialisation
  audio/         crackSynth (pure DSP), SoundGate (pure), AudioEngine (Web Audio)
  render/        Camera, Renderer (Canvas 2D), spline, particles, effects, themes
  input/         Pointer/keyboard → intents
  ui/            Spanish DOM UI bindings
  diagnostics/   FrameStats
  app/           LatigoApp orchestrator, settings persistence
  electron/      main process, preload bridge, settings file store
  renderer/      index.html, styles.css, entry point
tests/           Vitest suites (Node environment, no DOM)
bench/           Headless benchmark
```

The physics core is enforced headless by an ESLint rule (`no-restricted-globals` / `no-restricted-imports` under `src/core`). More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the physics notes in [docs/PHYSICS.md](docs/PHYSICS.md).

### Why Electron + TypeScript?

Evaluated against Godot, C++/SDL and Rust: on the target machines only Node.js was available, and the web platform gives a mature, low-latency audio API (Web Audio, `latencyHint: 'interactive'`), hardware-accelerated 2D canvas with HiDPI support, uniform pointer/trackpad events, one codebase packaged for macOS/Windows/Linux by `electron-builder`, an MIT-compatible dependency tree, trivial headless testing of the physics core, and the lowest barrier for contributors. The trade-off is a larger binary (~290 MB unpacked) than a native build. The physics core has no Electron dependency and could be ported.

## Testing

`npm test` runs 79 tests (all passing at the time of the initial commit) covering rope initialisation, segment lengths, rest stability, handle movement, wave propagation, tip amplification, recovery, high-speed stability, NaN/Infinity handling, fixed timestep consistency across frame rates, crack detection, duplicate-sound prevention, reset, settings loading and corrupt-file recovery, the settings file store, audio synthesis, bounded effects and headless execution. Details and limits: [docs/TESTING.md](docs/TESTING.md).

## Compatibility

| Platform                         | Status                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| macOS 26 · Apple Silicon (arm64) | ✅ Verified: development run, smoke test, unpacked package (ad-hoc signed) launched and smoke-tested |
| macOS · Intel (x64)              | ⚙️ Configured (`dist:mac` builds x64 too), not verified                                              |
| Windows 10/11 x64/arm64          | ⚙️ Configured (NSIS + portable) and in CI, not verified locally                                      |
| Linux x64/arm64                  | ⚙️ Configured (AppImage + tar.gz) and in CI, not verified locally                                    |

## Troubleshooting

- **No sound** — check the _Audio_ row in lab mode. In the browser preview, audio starts after the first click/key. If the device disappeared, focusing the window retries; the simulation keeps running regardless.
- **Strike does not crack** — that's physics: increase _Fuerza_, lower _Amortiguación_, or move faster and stop abruptly.
- **Settings look wrong after an update** — the app validates and repairs settings; corrupt files are backed up as `settings.corrupt-<date>.json` next to `settings.json`. _Restablecer ajustes_ restores defaults.
- **Linux sandbox error** — see [docs/BUILDING.md](docs/BUILDING.md#linux).
- **Packaged macOS app crashes on launch** — the bundle name must stay ASCII (`Latigo Digital FX.app`); the accented name is shown via `CFBundleDisplayName`. See [docs/BUILDING.md](docs/BUILDING.md#macos).

## Limitations

- 2D side view; the physics is a plausible, stable approximation, not a validated model of real whip aerodynamics or supersonic tip motion. The crack threshold is a tuned speed (≈30 m/s at 2.2 m), not Mach 1. See [docs/PHYSICS.md](docs/PHYSICS.md).
- Canvas 2D rendering (no shaders or WebGL post-processing yet).
- Only macOS arm64 has been built and run so far.
- No automated end-to-end UI tests (the smoke test covers start-up, frame loop, physics and audio initialisation).

## Roadmap

- WebGL renderer with bloom and distortion shader.
- 3D/rotational wrist model and per-segment air drag.
- Audio worklet synthesis with per-crack parameters from physics (peak speed → spectrum).
- Gamepad support, multi-touch gestures.
- Recording and replay of strikes; exportable lab data (CSV).
- English UI localisation.

## Contributing

Contributions are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). No third-party media is bundled; all sounds are synthesised in code. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
