// Empacota o hub em dist/index.js. O pacote @nuvigia/shared (TypeScript puro do
// monorepo) entra no bundle; as outras dependências ficam em node_modules.
import { readFileSync } from 'node:fs';

import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@nuvigia/'));

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  logLevel: 'info',
});
