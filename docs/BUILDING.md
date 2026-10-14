# Building and packaging

All packaging commands use `--publish never`, and `package.json` sets `"publish": null`. Nothing in this project uploads artifacts or pushes to a remote.

## Common steps

```bash
npm ci              # or npm install
npm run check       # typecheck, lint, format check, tests
npm run smoke       # launches the real app and exits 0 when healthy
```

Outputs go to `release/` (git-ignored).

## macOS

```bash
npm run pack:dir    # release/mac-arm64/Latigo Digital FX.app (current arch)
npm run dist:mac    # DMG + ZIP for arm64 and x64
```

- **Bundle name**: the `.app` and executable are named `Latigo Digital FX` (ASCII). Packaging with the accented name made the Electron 44 bundle crash on launch (`EXC_BREAKPOINT`) on macOS 26 / arm64 during development; the Finder/Dock name is set to **Látigo Digital FX** through `CFBundleDisplayName`, and the window title and menus use the accented name.
- **Signing**: by default builds are **ad-hoc signed** (`"identity": "-"`) with the hardened runtime and `build/entitlements.mac.plist` (JIT, unsigned executable memory, disabled library validation). Ad-hoc apps run on the machine that built them; other Macs will show a Gatekeeper warning.
- **Developer ID signing (optional)**: override the identity, e.g. `npx electron-builder --mac -c.mac.identity="Developer ID Application: Your Name (TEAMID)" --publish never`. You can then remove `disable-library-validation` from the entitlements.
- **Notarization (optional)**: set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` in your local environment (never commit them) and add `"notarize": true` under `build.mac`. Notarization uploads the binary to Apple, so it is intentionally not enabled by default.
- **Intel**: `dist:mac` also builds `x64`. Not verified yet.

Verified so far: macOS 26.6 on Apple Silicon — `npm start`, `npm run smoke`, and `npm run pack:dir` followed by running the packaged app with `--smoke-test`.

## Windows

```bash
npm run dist:win    # NSIS installer (x64, arm64) + portable exe (x64)
```

- Per-user installation (no administrator rights required); the user may change the folder.
- Settings: `%APPDATA%\Látigo Digital FX\settings.json`.
- High-DPI scaling is handled by Chromium; the canvas uses `devicePixelRatio`.
- Code signing: provide `CSC_LINK`/`CSC_KEY_PASSWORD` locally if you have a certificate; unsigned builds trigger SmartScreen warnings.
- Cross-building Windows installers from macOS requires Wine; prefer a Windows machine or the CI job.

Status: configured and covered by the CI matrix; **not verified locally**.

## Linux

```bash
npm run dist:linux  # AppImage + tar.gz for x64 and arm64
```

- Runtime libraries (usually present on desktop distributions): GTK 3, NSS, ALSA (`libasound2`), GBM, X11 or XWayland.
- Settings: `~/.config/Látigo Digital FX/settings.json`.
- AppImage: `chmod +x latigo-digital-fx-*.AppImage && ./latigo-digital-fx-*.AppImage`. Some distributions need `libfuse2`.
- **Sandbox**: if Chromium complains about `chrome-sandbox` permissions when running from the tar.gz, either fix the helper (`sudo chown root chrome-sandbox && sudo chmod 4755 chrome-sandbox`) or enable unprivileged user namespaces. The CI smoke test passes `--no-sandbox` only because hosted runners lack the SUID helper; do not use it for normal use.
- Other distribution options: `deb`, `rpm`, Flatpak or Snap can be added as electron-builder targets.

Status: configured and covered by the CI matrix; **not verified locally**.

## Continuous integration

`.github/workflows/ci.yml` runs typecheck, lint, format check, tests and the benchmark on Ubuntu, then builds, smoke-tests and packages an unpacked, unsigned app on Ubuntu, Windows and macOS, uploading it as a 7-day **CI artifact**. It has `contents: read` permissions and never creates releases. It has not run yet because the repository has not been pushed.
