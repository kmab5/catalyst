import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
  lstatSync,
} from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { CatalystError } from '../errors.js';
import Database from 'better-sqlite3';

export const projectId = (root: string) =>
  createHash('sha1').update(root).digest('hex').slice(0, 12);
export function expandHome(path: string, home: string) {
  return resolve(/^~(?:[/\\]|$)/.test(path) ? join(home, path.slice(1)) : path);
}
export function directory(path: string) {
  try {
    const root = realpathSync(path);
    if (statSync(root).isDirectory()) return root;
  } catch {}
  throw new CatalystError('PATH_NOT_FOUND', 'Directory could not be opened');
}
export function isProjectDir(path: string) {
  return [
    '.git',
    'package.json',
    'pyproject.toml',
    'requirements.txt',
    'setup.py',
    'go.mod',
    'Cargo.toml',
    'pom.xml',
    'build.gradle',
    'Gemfile',
    'composer.json',
    '.catalyst',
  ].some((name) => existsSync(join(path, name)));
}
export function ensureGitignore(root: string) {
  const path = join(root, '.gitignore');
  if (!existsSync(path) || !lstatSync(path).isFile()) return 'no-gitignore';
  const contents = readFileSync(path, 'utf8');
  if (/^\/?\.catalyst\/?\s*$/m.test(contents)) return 'present';
  appendFileSync(
    path,
    (contents.endsWith('\n') ? '' : '\n') + '# Catalyst local index\n.catalyst/\n',
  );
  return 'added';
}
export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw new CatalystError('BAD_REQUEST', 'Invalid configuration file: ' + basename(path));
  }
}
export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = path + '.' + randomUUID() + '.tmp';
  writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
  renameSync(temp, path);
}
// JSON rename protects readers. This OS-backed lock also serializes independent CLI writers.
export function updateLocalState<T>(path: string, change: () => T): T {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const mutex = new Database(join(dirname(path), '.state-lock.sqlite'));
  try {
    return mutex.transaction(change).immediate();
  } finally {
    mutex.close();
  }
}
type Recent = {
  id: string;
  root: string;
  name: string;
  lastOpenedAt: number;
  lastIndexedAt: number | null;
};
export class ProjectRegistry {
  private path: string;
  constructor(home: string) {
    this.path = join(home, '.catalyst', 'projects.json');
  }
  recent() {
    return readJson<Recent[]>(this.path, []).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  }
  touch(root: string) {
    updateLocalState(this.path, () => {
      const rows = this.recent(),
        id = projectId(root),
        old = rows.find((r) => r.id === id);
      writeJson(this.path, [
        {
          id,
          root,
          name: basename(root),
          lastOpenedAt: Date.now(),
          lastIndexedAt: old?.lastIndexedAt ?? null,
        },
        ...rows.filter((r) => r.id !== id),
      ]);
    });
  }
  indexed(id: string, time: number) {
    updateLocalState(this.path, () =>
      writeJson(
        this.path,
        this.recent().map((r) => (r.id === id ? { ...r, lastIndexedAt: time } : r)),
      ),
    );
  }
  forget(id: string) {
    updateLocalState(this.path, () =>
      writeJson(
        this.path,
        this.recent().filter((r) => r.id !== id),
      ),
    );
  }
}
export function secretPath(path: string) {
  return path
    .split(/[/\\]/)
    .some((part) =>
      /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12)|id_rsa.*|credentials.*\.json|secrets\..*)$/i.test(
        part,
      ),
    );
}
export class LocalPathSource {
  readonly kind = 'local';
  constructor(readonly root: string) {}
  private async safe(rel: string) {
    const path = await realpath(resolve(this.root, rel)),
      own = relative(this.root, path);
    if (
      isAbsolute(rel) ||
      relative(path, resolve(this.root, rel)) !== '' ||
      own === '..' ||
      own.startsWith('..' + sep) ||
      isAbsolute(own) ||
      secretPath(rel) ||
      secretPath(own)
    )
      throw new CatalystError('BAD_REQUEST', 'Source path is unavailable');
    return path;
  }
  async readFile(rel: string) {
    return readFile(await this.safe(rel), 'utf8');
  }
  async stat(rel: string) {
    return stat(await this.safe(rel));
  }
  async *listFiles(sub = ''): AsyncGenerator<string> {
    const entries = await readdir(await this.safe(sub), { withFileTypes: true });
    for (const e of entries) {
      const path = sub ? sub + '/' + e.name : e.name;
      if (
        e.isSymbolicLink() ||
        secretPath(path) ||
        ['.git', '.catalyst', 'node_modules'].includes(e.name)
      )
        continue;
      if (e.isDirectory()) yield* this.listFiles(path);
      else if (e.isFile()) yield path;
    }
  }
}
