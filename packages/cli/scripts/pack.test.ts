import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const cli = fileURLToPath(new URL('../', import.meta.url));

test('published CLI ships a standalone bin, web UI, and working offline parsers', () => {
  const temp = mkdtempSync(join(tmpdir(), 'catalyst-pack-'));
  const env = { ...process.env, COREPACK_ENABLE_NETWORK: '0', npm_config_offline: 'true' };
  try {
    const opts = {
      cwd: cli,
      env,
      encoding: 'utf8' as const,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    };
    const pm = join(cli, 'scripts/pnpm.mjs');
    execFileSync(process.execPath, [pm, 'run', 'build'], opts);
    execFileSync(process.execPath, [pm, 'pack', '--pack-destination', temp], opts);
    const tarball = readdirSync(temp).find((name) => name.endsWith('.tgz'));
    expect(tarball).toBeDefined();
    execFileSync('tar', ['-xzf', join(temp, tarball!), '-C', temp], { windowsHide: true });
    const packed = join(temp, 'package');
    const manifest = JSON.parse(readFileSync(join(packed, 'package.json'), 'utf8'));
    const bin = join(packed, manifest.bin.catalyst);
    expect(manifest.name).toBe('catalyst-dx');
    expect(readFileSync(bin, 'utf8')).toMatch(/^#!\/usr\/bin\/env node/);
    expect(existsSync(join(packed, 'dist/web/index.html'))).toBe(true);
    for (const language of ['typescript', 'tsx', 'javascript', 'python', 'go']) {
      const wasm = readFileSync(join(packed, 'dist/grammars/tree-sitter-' + language + '.wasm'));
      expect(wasm.subarray(0, 4).toString('hex')).toBe('0061736d');
    }
    // Give the unpacked tarball *only* its declared runtime dependencies. Linking
    // the installed versions locally keeps the package smoke entirely offline.
    const modules = join(packed, 'node_modules');
    mkdirSync(modules);
    for (const dep of Object.keys(manifest.dependencies)) {
      expect(dep.startsWith('@catalyst/')).toBe(false);
      const target = join(modules, dep);
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(realpathSync(join(cli, 'node_modules', dep)), target, 'junction');
    }
    const home = join(temp, 'home');
    const project = join(temp, 'sample');
    mkdirSync(home);
    mkdirSync(project);
    writeFileSync(join(project, 'package.json'), '{"name":"sample","type":"module"}');
    writeFileSync(join(project, 'helper.ts'), 'export function greet() { return "hi"; }');
    const run = (...args: string[]) =>
      execFileSync(process.execPath, [bin, ...args], {
        cwd: project,
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...env, HOME: home, USERPROFILE: home, CATALYST_PROVIDER: 'none' },
      }).trim();
    expect(run('--version')).toBe(manifest.version);
    expect(JSON.parse(run('index', '--json', '--no-ai'))).toMatchObject({
      status: 'done',
      stats: { llmCalls: 0 },
    });
    const projects = run('projects');
    expect(projects).toContain('sample');
    expect(JSON.parse(run('health', '--json')).summary).toHaveProperty('high');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}, 180_000);
