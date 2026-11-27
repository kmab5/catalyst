import { describe, expect, test } from 'vitest';
import { loadFixture } from './load-fixture';
import type { TreeNode } from '../src/api/contract';

function collectTreeIds(node: TreeNode): string[] {
  const out = [node.id];
  if (node.children) {
    for (const c of node.children) out.push(...collectTreeIds(c));
  }
  return out;
}

function collectRefs(obj: unknown, known: string[] = []): string[] {
  if (!obj || typeof obj !== 'object') return known;
  if (Array.isArray(obj)) {
    for (const item of obj) collectRefs(item, known);
    return known;
  }
  const rec = obj as Record<string, unknown>;
  if (
    typeof rec.id === 'string' &&
    typeof rec.kind === 'string' &&
    'provenance' in rec
  ) {
    known.push(rec.id);
  }
  for (const v of Object.values(rec)) {
    if (typeof v === 'string') {
      const matches = v.matchAll(/\[\[((?:dir|file|sym|route|db|env|pkg|svc|feature):[^\]]+)\]\]/g);
      for (const m of matches) {
        if (m[1]) known.push(m[1]);
      }
    } else if (typeof v === 'object' && v !== null) {
      collectRefs(v, known);
    }
  }
  return known;
}

describe('taxonomy fixture index', () => {
  test('fixture parses', () => {
    expect(() => loadFixture()).not.toThrow();
  });

  test('every referenced node id exists', () => {
    const f = loadFixture();
    const known = new Set([...collectTreeIds(f.tree), ...Object.keys(f.nodes)]);
    const refs = collectRefs(f);
    expect(
      refs.filter((id) => !known.has(id) && !id.startsWith('feature:')),
    ).toEqual([]);
  });

  test('has the demo content', () => {
    const f = loadFixture();
    expect(f.features.map((x) => x.id)).toEqual(
      expect.arrayContaining([
        'feature:authentication',
        'feature:billing-subscriptions',
        'feature:posts-editor',
        'feature:dashboard',
        'feature:marketing-docs',
        'feature:shared',
      ]),
    );
    expect(
      f.askScripts['Where do we handle Stripe webhooks?']?.at(-1),
    ).toMatchObject({ type: 'done', answer: { found: true } });
    expect(f.askScripts['Do we have password reset?']?.at(-1)).toMatchObject({
      type: 'done',
      answer: { found: false },
    });
  });
});
