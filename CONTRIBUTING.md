# Contributing to Látigo Digital FX

Thanks for your interest! Contributions in English or Spanish are welcome. / ¡Gracias por tu interés! Se aceptan contribuciones en inglés o español.

## Getting started

```bash
npm install
npm start           # run the desktop app
npm run dev:web     # optional: browser preview at http://127.0.0.1:5178
npm run check       # typecheck + lint + format check + tests
```

Requires Node.js 22+.

## Guidelines

- **Code** (files, classes, functions, variables, comments) in **English**; **UI text** in **Spanish**.
- Keep `src/core` and `src/config` headless: no DOM, audio, Electron or renderer imports. ESLint enforces it.
- Physics changes need a deterministic, headless test (use `tests/helpers.ts`). Do not loosen thresholds just to make a test pass — explain physical changes in `docs/PHYSICS.md`.
- Keep every buffer bounded (particles, events, voices…). No unbounded queues.
- No telemetry, network access, analytics, global input hooks or screen capture. The app must stay fully offline.
- Third-party assets must have a licence compatible with MIT and be recorded in `THIRD_PARTY_NOTICES.md` (source, licence, attribution, modifications).
- Run `npm run format` before committing. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…).
- Update `CHANGELOG.md` for user-visible changes.

## Pull requests

1. Fork and create a branch from `main`.
2. Make focused changes with tests.
3. Ensure `npm run check` and `npm run smoke` pass.
4. Fill in the pull-request template, describing how you tested.

## Reporting bugs

Use the issue templates. Include your OS, app version and, if possible, the data shown in lab mode (`L`). For security issues, follow [SECURITY.md](SECURITY.md) instead.
