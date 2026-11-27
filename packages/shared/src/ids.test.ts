import { expect, test } from 'vitest';
import { ids, slugify, toPosixRel } from './ids.js';

test('file ids normalise windows paths', () => expect(ids.file('src\\lib\\a.ts')).toBe('file:src/lib/a.ts'));
test('method ids', () => expect(ids.sym('a.ts', 'm', { className: 'C' })).toBe('sym:a.ts#C.m'));
test('duplicate names get line suffix', () => expect(ids.sym('a.ts', 'handler', { line: 42 })).toBe('sym:a.ts#handler@42'));
test('route-group paths round-trip', () => {
  const id = ids.sym('app/(dashboard)/editor/[postId]/page.tsx', 'default');
  expect(ids.parse(decodeURIComponent(encodeURIComponent(id)))).toMatchObject({ kind: 'symbol', path: 'app/(dashboard)/editor/[postId]/page.tsx', name: 'default' });
});
test('route ids', () => expect(ids.route('post', '/api/webhooks/stripe')).toBe('route:POST /api/webhooks/stripe'));
test('kindOf', () => expect(['dir:x','file:x','sym:x#y','route:GET /','db:prisma:U','env:X','pkg:npm:a','svc:s','feature:f'].map(ids.kindOf))
  .toEqual(['directory','file','symbol','route','db_model','env_var','package','service','feature']));
test('slugify', () => expect(slugify('Billing & Subscriptions')).toBe('billing-subscriptions'));
test('toPosixRel', () => expect(toPosixRel('/r', '/r/src/a.ts')).toBe('src/a.ts'));
