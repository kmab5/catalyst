import { posix as p } from 'node:path';
const stdlib = new Set(
  'abc argparse array ast asyncio base64 binascii bisect builtins calendar collections concurrent contextlib contextvars copy csv ctypes dataclasses datetime decimal difflib email enum errno functools gc glob gzip hashlib heapq hmac html http importlib inspect io ipaddress itertools json logging math multiprocessing operator os pathlib pickle platform pprint queue random re secrets shlex shutil signal socket sqlite3 ssl statistics string struct subprocess sys tempfile threading time timeit tomllib traceback types typing unittest urllib uuid warnings weakref xml zipfile zoneinfo'.split(
    ' ',
  ),
);
const aliases: Record<string, string> = {
  jwt: 'pyjwt',
  yaml: 'pyyaml',
  PIL: 'pillow',
  cv2: 'opencv-python',
  sklearn: 'scikit-learn',
  jose: 'python-jose',
  dotenv: 'python-dotenv',
  sentry_sdk: 'sentry-sdk',
};
export type PyResolution =
  | { kind: 'file'; path: string; symbol?: string }
  | { kind: 'package'; name: string; stdlib: boolean }
  | { kind: 'unresolved' };
export class PyResolver {
  private bases: string[];
  constructor(
    private files: Set<string>,
    readText?: (path: string) => string | null,
  ) {
    const bases = new Set(['.', 'src']);
    for (const f of files)
      if (/(?:^|\/)(?:pyproject\.toml|setup\.(?:py|cfg)|requirements[^/]*\.txt)$/.test(f)) {
        bases.add(p.dirname(f));
        bases.add(p.join(p.dirname(f), 'src'));
      }
    this.bases = [...bases].sort((a, b) => b.length - a.length);
  }
  roots() {
    return this.bases;
  }
  private probe(base: string) {
    return [base + '.py', p.join(base, '__init__.py'), base + '.pyi'].find((f) => this.files.has(f));
  }
  resolve(from: string, specifier: string, importedName?: string): PyResolution {
    const dots = specifier.match(/^\.+/)?.[0].length ?? 0;
    const module = specifier.slice(dots).replace(/\./g, '/');
    const bases = dots ? [p.join(p.dirname(from), ...Array<string>(dots - 1).fill('..'))] : this.bases;
    for (const root of bases) {
      const path = p.join(root, module);
      const sub = importedName && this.probe(p.join(path, importedName));
      if (sub) return { kind: 'file', path: sub };
      const target = this.probe(path);
      if (target)
        return importedName
          ? { kind: 'file', path: target, symbol: importedName }
          : { kind: 'file', path: target };
    }
    const moduleName = specifier.split('.')[0]!;
    return dots
      ? { kind: 'unresolved' }
      : { kind: 'package', name: aliases[moduleName] ?? moduleName, stdlib: stdlib.has(moduleName) };
  }
}
