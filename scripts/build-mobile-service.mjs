import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(root, 'src', 'mobile', 'service-entry.cjs')],
  outfile: path.join(root, 'src', 'mobile', 'generated-service.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome130'],
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
});
