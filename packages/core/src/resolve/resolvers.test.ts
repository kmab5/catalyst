import { expect, it } from 'vitest';
import { TsResolver } from './ts-resolver.js';
import { PyResolver } from './py-resolver.js';
it('walks inherited paths, probes index modules and stops cyclic barrels', () => {
  const files = new Set([
    'tsconfig.base.json',
    'app/tsconfig.json',
    'lib/tools/index.ts',
    'app/a.ts',
    'app/b.ts',
  ]);
  const ts = new TsResolver(files, (p) =>
    p === 'app/tsconfig.json'
      ? { extends: '../tsconfig.base' }
      : p === 'tsconfig.base.json'
        ? { compilerOptions: { paths: { '@/*': ['lib/*'] } } }
        : null,
  );
  expect(ts.resolve('app/a.ts', '@/tools')).toEqual({ kind: 'file', path: 'lib/tools/index.ts' });
  expect(ts.resolve('app/a.ts', '@scope/lib/dist')).toEqual({
    kind: 'package',
    builtin: false,
    name: '@scope/lib',
  });
  expect(ts.resolve('app/a.ts', 'node:fs')).toMatchObject({ kind: 'package', builtin: true });
  expect(
    ts.resolveBinding(
      'app/a.ts',
      './b',
      'x',
      new Map([
        ['app/a.ts', [{ local: '*', exported: '*', specifier: './b' }]],
        ['app/b.ts', [{ local: '*', exported: '*', specifier: './a' }]],
      ]),
    ),
  ).toBeNull();
});
it('resolves nested Python source roots, relative packages, aliases, and the standard library', () => {
  const r = new PyResolver(
    new Set([
      'backend/pyproject.toml',
      'backend/app/models.py',
      'backend/app/core/security.py',
      'backend/app/api/routes/items.py',
      'backend/app/api/routes/__init__.py',
    ]),
  );
  const from = 'backend/app/api/routes/items.py';
  expect(r.roots()).toContain('backend');
  expect(r.resolve(from, '...core', 'security')).toEqual({
    kind: 'file',
    path: 'backend/app/core/security.py',
  });
  expect(r.resolve(from, 'app.models', 'Item')).toEqual({
    kind: 'file',
    path: 'backend/app/models.py',
    symbol: 'Item',
  });
  expect(r.resolve(from, 'jwt')).toEqual({ kind: 'package', name: 'pyjwt', stdlib: false });
  expect(r.resolve(from, 'os')).toEqual({ kind: 'package', name: 'os', stdlib: true });
});
