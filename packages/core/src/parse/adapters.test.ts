import { beforeAll, expect, it } from 'vitest';
import type Parser from 'web-tree-sitter';
import { tsAdapter } from './ts-adapter.js';
import { pyAdapter } from './py-adapter.js';
import { loadGrammars } from './grammars.js';
let tsx: Parser, py: Parser;
beforeAll(async () => {
  const grammar = await loadGrammars();
  tsx = (await grammar.parser('tsx'))!;
  py = (await grammar.parser('python'))!;
});
const parseTs = (source: string) => tsAdapter.parse({ path: 'index.tsx', source, parser: tsx });
const parsePy = (source: string) => pyAdapter.parse({ path: 'index.py', source, parser: py });
it('classifies declarations and assigns calls to the enclosing symbol', () => {
  const p = parseTs(
    "'use client'; export function Button(){return <b/>}; export const useUser=()=>1; function helper(){}; class C { m(){this.n()} n(){} }",
  );
  expect(p.symbols.map((s) => [s.name, s.symbolKind, s.exported])).toEqual([
    ['Button', 'component', true],
    ['useUser', 'hook', true],
    ['helper', 'function', false],
    ['C', 'class', false],
    ['m', 'method', false],
    ['n', 'method', false],
  ]);
  expect(p.directives).toEqual(['use client']);
  expect(p.calls).toContainEqual(expect.objectContaining({ calleeText: 'this.n', callerSymbol: 'C.m' }));
});
it('captures imported bindings, re-exports, dynamic imports and CommonJS', () => {
  const p = parseTs(
    "import Main, { type A, q as queued } from './a'; import * as kit from './kit'; import('./dynamic'); const f=require('fs'); export * from './b'; export { x as y } from './c'; exports.cool=queued;",
  );
  expect(p.imports).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        specifier: './a',
        isDefault: true,
        names: [{ local: 'Main', imported: 'default' }],
      }),
      expect.objectContaining({ specifier: './a', isTypeOnly: true, names: [{ local: 'A', imported: 'A' }] }),
      expect.objectContaining({ specifier: './a', names: [{ local: 'queued', imported: 'q' }] }),
      expect.objectContaining({ specifier: './kit', isNamespace: true }),
      expect.objectContaining({ specifier: './dynamic', isDynamic: true }),
      expect.objectContaining({ specifier: 'fs' }),
    ]),
  );
  expect(p.exports).toContainEqual({ local: 'x', exported: 'y', specifier: './c' });
  expect(p.exports).toContainEqual({ local: 'queued', exported: 'cool' });
});
it('counts decisions per function and separates nested functions', () => {
  const p = parseTs('function f(x){ if(x && x.length) return x; function nested(y){if(y || x)return y} }');
  expect(p.complexity).toEqual({ f: 3, nested: 3 });
  const python = parsePy('def f(a):\n    if a and b: pass\n    elif c: pass\n    return [x for x in y if x]');
  expect(python.complexity.f).toBe(5);
});
it('extracts relative Python imports, decorators, inheritance and explicit exports', () => {
  const p = parsePy(
    'from ..core import security as sec\n__all__=["a"]\n@router.post("/")\ndef a(): pass\ndef b(): pass\nclass Item(Base):\n    def change(self): self.save()',
  );
  expect(p.imports[0]).toMatchObject({
    specifier: '..core',
    names: [{ imported: 'security', local: 'sec' }],
  });
  expect(p.decorators[0]).toMatchObject({ target: 'a', text: 'router.post("/")' });
  expect(p.refs).toContainEqual(
    expect.objectContaining({ kind: 'extends', callerSymbol: 'Item', name: 'Base' }),
  );
  expect(p.symbols.filter((s) => s.exported).map((s) => s.name)).toEqual(['a']);
  expect(p.calls).toContainEqual(
    expect.objectContaining({ callerSymbol: 'Item.change', calleeText: 'self.save' }),
  );
});
