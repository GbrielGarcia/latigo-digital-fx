// Builds the renderer bundle, the Electron main/preload scripts and
// (optionally) the headless benchmark. No network access, no publishing.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const args = new Set(process.argv.slice(2));
const production = args.has('--production');

const common = {
  bundle: true,
  sourcemap: production ? false : 'linked',
  minify: production,
  logLevel: 'warning',
  legalComments: 'none',
};

rmSync(join(dist, 'renderer'), { recursive: true, force: true });
rmSync(join(dist, 'electron'), { recursive: true, force: true });
mkdirSync(join(dist, 'renderer'), { recursive: true });

await Promise.all([
  build({
    ...common,
    entryPoints: [join(root, 'src/renderer/main.ts')],
    outfile: join(dist, 'renderer/app.js'),
    platform: 'browser',
    format: 'iife',
    target: ['chrome120'],
  }),
  build({
    ...common,
    entryPoints: [join(root, 'src/renderer/overlayMain.ts')],
    outfile: join(dist, 'renderer/overlay.js'),
    platform: 'browser',
    format: 'iife',
    target: ['chrome120'],
  }),
  build({
    ...common,
    entryPoints: [join(root, 'src/electron/main.ts')],
    outfile: join(dist, 'electron/main.cjs'),
    platform: 'node',
    format: 'cjs',
    target: ['node20'],
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: [join(root, 'src/electron/preload.ts')],
    outfile: join(dist, 'electron/preload.cjs'),
    platform: 'node',
    format: 'cjs',
    target: ['node20'],
    external: ['electron'],
  }),
  args.has('--bench')
    ? build({
        ...common,
        sourcemap: false,
        entryPoints: [join(root, 'bench/physicsBench.ts')],
        outfile: join(dist, 'bench/bench.mjs'),
        platform: 'node',
        format: 'esm',
        target: ['node20'],
      })
    : Promise.resolve(),
]);

for (const file of ['index.html', 'styles.css', 'overlay.html', 'overlay.css']) {
  cpSync(join(root, 'src/renderer', file), join(dist, 'renderer', file));
}
// Tray / menu-bar icon used by the desktop mode.
cpSync(join(root, 'build/icon.png'), join(dist, 'electron/tray.png'));
console.log('Build OK → dist/');
