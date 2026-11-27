import type { NodeKind } from './schemas/graph.js';

const kinds = {
  dir: 'directory', file: 'file', sym: 'symbol', route: 'route', db: 'db_model',
  env: 'env_var', pkg: 'package', svc: 'service', feature: 'feature',
} as const satisfies Record<string, NodeKind>;

interface ParsedId {
  raw: string;
  kind: NodeKind;
  path?: string;
  name?: string;
  className?: string;
  line?: number;
  method?: string;
  orm?: string;
  ecosystem?: string;
}

function posix(path: string): string {
  return path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
}

export function slugify(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

/** Both paths are absolute. Keep this helper browser-compatible for the web client. */
export function toPosixRel(root: string, abs: string): string {
  const split = (s: string) => posix(s).split('/').filter(Boolean);
  const from = split(root);
  const to = split(abs);
  const windows = /^[a-z]:|^\\\\/i.test(root);
  const comparable = (part: string) => windows ? part.toLowerCase() : part;
  let shared = 0;
  while (shared < from.length && shared < to.length && comparable(from[shared]!) === comparable(to[shared]!)) shared++;
  return [...from.slice(shared).map(() => '..'), ...to.slice(shared)].join('/');
}

function kindOf(id: string): NodeKind {
  const prefix = id.slice(0, id.indexOf(':')) as keyof typeof kinds;
  if (!Object.hasOwn(kinds, prefix)) throw new Error('Unknown node ID prefix');
  return kinds[prefix];
}

function parse(raw: string): ParsedId {
  const kind = kindOf(raw);
  const value = raw.slice(raw.indexOf(':') + 1);
  const result = { raw, kind };
  if (kind === 'file' || kind === 'directory') return { ...result, path: value };
  if (kind === 'symbol') {
    const separator = value.lastIndexOf('#');
    if (separator < 0) throw new Error('Missing symbol name');
    const symbol = value.slice(separator + 1);
    const suffix = /@(\d+)$/.exec(symbol);
    const qualified = suffix ? symbol.slice(0, suffix.index) : symbol;
    const dot = qualified.indexOf('.');
    return {
      ...result, path: value.slice(0, separator), name: qualified.slice(dot + 1),
      ...(dot >= 0 ? { className: qualified.slice(0, dot) } : {}),
      ...(suffix ? { line: Number(suffix[1]) } : {}),
    };
  }
  if (kind === 'route') {
    const space = value.indexOf(' ');
    return { ...result, method: value.slice(0, space), path: value.slice(space + 1) };
  }
  if (kind === 'db_model' || kind === 'package') {
    const colon = value.indexOf(':');
    const category = value.slice(0, colon);
    return { ...result, name: value.slice(colon + 1), ...(kind === 'package' ? { ecosystem: category } : { orm: category }) };
  }
  return { ...result, name: value };
}

export const ids = {
  dir: (path: string) => 'dir:' + posix(path),
  file: (path: string) => 'file:' + posix(path),
  sym: (path: string, name: string, opts: { className?: string; line?: number } = {}) =>
    'sym:' + posix(path) + '#' + (opts.className ? opts.className + '.' : '') + name + (opts.line !== undefined ? '@' + opts.line : ''),
  route: (method: string, path: string) => 'route:' + method.toUpperCase() + ' ' + path,
  db: (orm: string, model: string) => 'db:' + orm + ':' + model,
  env: (name: string) => 'env:' + name,
  pkg: (ecosystem: 'npm' | 'pypi' | 'go', name: string) => 'pkg:' + ecosystem + ':' + name,
  svc: (name: string) => 'svc:' + name,
  feature: (name: string) => 'feature:' + slugify(name),
  parse,
  kindOf,
};
