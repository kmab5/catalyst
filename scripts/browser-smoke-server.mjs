import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const temp = await mkdtemp(join(tmpdir(), 'catalyst-browser-'));
const home = join(temp, 'home');
const repo = join(temp, 'ts-basic');
const env = { ...process.env, HOME: home, USERPROFILE: home };
const cli = 'packages/cli/dist/index.js';
let child;
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => child?.kill());
async function run(args) {
  child = spawn(process.execPath, [cli, ...args], { env, stdio: ['ignore', 'inherit', 'inherit'] });
  const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (status !== 0 && status !== null) throw new Error('CLI exited with status ' + status);
}
try {
  await mkdir(home);
  await cp('fixtures/repos/ts-basic', repo, { recursive: true, filter: p => basename(p) !== '.catalyst' });
  await run(['index', '--no-ai', repo, '--json']);
  await run(['serve', repo, '--no-open', '--port', '4400']);
} finally {
  await rm(temp, { recursive: true, force: true });
}
