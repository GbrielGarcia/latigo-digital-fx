# Third-party notices

## Bundled media

None. All sounds are synthesised at runtime by `src/audio/crackSynth.ts`; the icon (`build/icon.svg`, `build/icon.png`) and all graphics were created for this project and are covered by the project's MIT licence. No fonts are bundled (system fonts are used).

## Runtime

| Component                                  | Licence | Notes                                                                                                                                                        |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Electron](https://www.electronjs.org/) 44 | MIT     | Shipped in packaged builds. Electron includes Chromium and Node.js, whose licences are distributed inside the package (`LICENSE`, `LICENSES.chromium.html`). |

The application has no other runtime npm dependencies.

## Development tools (not shipped)

| Package                                        | Licence    |
| ---------------------------------------------- | ---------- |
| TypeScript                                     | Apache-2.0 |
| esbuild                                        | MIT        |
| Vitest                                         | MIT        |
| ESLint, @eslint/js, typescript-eslint, globals | MIT        |
| Prettier                                       | MIT        |
| electron-builder                               | MIT        |
| @types/node                                    | MIT        |

A scan of `node_modules` at the initial commit found only permissive licences (MIT, ISC, Apache-2.0, BSD-2/3-Clause, BlueOak-1.0.0, 0BSD, CC0/WTFPL dual licences, Python-2.0) and two MPL-2.0 packages in the development toolchain. None of these are bundled into the application, so the MIT licence of this project is compatible.

## Attribution

The Code of Conduct is adapted from the Contributor Covenant 2.1 (CC BY 4.0).
