# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-10-14

### Added

- «Modo escritorio»: transparent, borderless, always-on-top overlay that renders the existing whip (same physics, renderer, effects and audio) above other applications.
- Click-through overlay (`setIgnoreMouseEvents`) with an explicit interactive mode (Esc or banner button to return).
- Global cursor tracking through `screen.getCursorScreenPoint()` at 60 Hz, only while needed; `DesktopCoordinateMapper` for multi-monitor, negative coordinates, HiDPI and resolution changes.
- Configurable global shortcuts (strike, show/hide, pause, mute) with recording UI, validation, conflict reporting and safe defaults.
- Tray / menu-bar icon with show settings, show/hide, strike, pause, mute, click-through, reset, disable and quit.
- Close behaviour setting («Seguir en la bandeja» / «Salir»); the desktop whip survives minimising or closing the settings window.
- Platform capability detection (macOS, Windows, Linux X11/Wayland) with Spanish guidance in the UI.
- Settings v2 with a `desktop` section; v1 files migrate without data loss.
- 30 new unit tests and a 38-check desktop integration self-test (`npm run test:desktop`).

### Changed

- The main process is now the single source of truth for settings shared by both windows.
- Smoke/self-tests use an isolated temporary Chromium profile.

## [0.1.0] — 2026-10-14

### Added

- Headless physics core: Verlet rope with tapered mass, iterative distance and bending constraints, damping, speed caps and NaN recovery.
- Fixed-timestep stepper with accumulator, per-frame step cap, pause recovery and render interpolation.
- Whip model with kinematic handle and wrist tilt; scripted strikes (side, overhead, upward) and drag-and-release strikes.
- Crack detector with hysteresis, peak detection and refractory period; live phase machine.
- Procedural crack audio (8 variants), swing whoosh, master volume, instant mute, duplicate/voice protection, graceful degradation without an audio device.
- Canvas 2D renderer: tapered spline rope, handle, popper, trail, particles, shockwaves, flash, camera shake, HiDPI, three themes.
- Modes: free, practice, demo, lab, slow motion, training.
- Spanish UI with settings panel, help dialog, keyboard shortcuts, hidden-panels mode, fullscreen and accessibility options.
- Settings persisted in the OS user-data directory with validation, atomic writes and corrupt-file backup.
- Electron shell with sandboxed renderer, strict CSP, blocked navigation and denied permissions; start-up smoke test.
- electron-builder configuration for macOS (DMG/ZIP), Windows (NSIS/portable) and Linux (AppImage/tar.gz), never publishing.
- 79 automated tests, physics benchmark, GitHub Actions CI, documentation in English and Spanish.
