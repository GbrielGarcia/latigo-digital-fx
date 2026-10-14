# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
