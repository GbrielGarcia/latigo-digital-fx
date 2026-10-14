# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability reporting ("Report a vulnerability" in the _Security_ tab) once the repository is published, or contact the maintainers privately. Include steps to reproduce, affected platform and impact. We aim to acknowledge reports within 7 days.

## Security model

Látigo Digital FX is a fully local desktop application:

- **No network access** at runtime: no telemetry, analytics, update checks or downloads. The Content-Security-Policy restricts the page to its own bundled files.
- **Renderer isolation**: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. The page only sees a minimal bridge (`window.latigoDesktop`) for loading/saving settings, toggling fullscreen and the start-up smoke report.
- **Navigation and new windows are blocked**; all permission requests (camera, microphone, notifications, etc.) are denied except fullscreen.
- **No screen capture, key logging, click interception, privileged helpers, auto-start or hidden background processes.**
- **Desktop mode (opt-in, off by default)** reads only the cursor position through Electron's official `screen.getCursorScreenPoint()` while the overlay is visible and unpaused, and registers only the four declared global shortcuts through `globalShortcut` (combinations must include ⌘/Ctrl, ⌥/Alt or Super, so normal typing is never captured). The overlay ignores mouse events in click-through mode. While desktop mode is on, a tray / menu-bar icon is always visible and offers a full quit. No macOS Accessibility, Input Monitoring or Screen Recording permission is requested. The desktop self-test inspects only the overlay's own rendered pixels.
- **Files written**: only `settings.json` (and, if a corrupt file is found, a `settings.corrupt-<date>.json` backup) in the per-user data directory, plus Chromium's own caches there. Settings are validated, size-limited (64 KiB) and written atomically.
- **No administrator rights** are needed to run or install (Windows installer is per-user).

## Dependencies

The packaged app has **no runtime npm dependencies**; it ships Electron plus the bundled application code. Development tools (TypeScript, esbuild, Vitest, ESLint, Prettier, electron-builder) are not included in the package. `npm audit --omit=dev` reported 0 vulnerabilities at the initial commit; `npm audit` reported moderate advisories in development-only tooling (transitive dependencies of the packaging toolchain).
