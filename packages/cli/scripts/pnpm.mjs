import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

// Reuse the pnpm that started the workspace command, including Corepack installations.
const entry = process.env.npm_execpath;
const bundled = join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'pnpm.js');
const executable =
  entry && /^pnpm\.(?:c?js|mjs)$/.test(basename(entry))
    ? entry
    : existsSync(bundled)
      ? bundled
      : undefined;
const args = process.argv.slice(2);
const result = executable
  ? spawnSync(process.execPath, [executable, ...args], { stdio: 'inherit' })
  : spawnSync('pnpm', args, { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
