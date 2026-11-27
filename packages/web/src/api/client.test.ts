import { afterEach, describe, expect, test } from 'vitest';
import { api } from './client';
import { installMockFetch, getFixture } from '../test/mockFetch';
import { handleMock } from '../../mock/handlers';

const origFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = origFetch;
  document.head.innerHTML = '';
});

describe('API client & mock handlers', () => {
  test('encodes route-group node ids', async () => {
    const seen: string[] = [];
    const f = getFixture();
    installMockFetch(f, {
      '*': (r) => {
        seen.push(r.url);
        return Response.json(f.nodes['file:lib/session.ts']);
      },
    });
    await api.node('p1', 'sym:app/(dashboard)/editor/[postId]/page.tsx#default');
    expect(seen[0]).toContain(
      '/api/projects/p1/nodes/sym%3Aapp%2F(dashboard)%2Feditor%2F%5BpostId%5D%2Fpage.tsx%23default',
    );
  });

  test('mutations send the token', async () => {
    const meta = document.createElement('meta');
    meta.name = 'catalyst-token';
    meta.content = 'tok_123';
    document.head.appendChild(meta);

    let gotToken: string | null = null;
    const f = getFixture();
    installMockFetch(f, {
      'POST /api/projects': (r) => {
        gotToken = r.headers.get('X-Catalyst-Token');
        return Response.json(f.projects[0]);
      },
    });

    await api.projects.open('/x');
    expect(gotToken).toBe('tok_123');
  });

  test('error body becomes ApiError', async () => {
    installMockFetch(getFixture(), {
      '*': () =>
        Response.json(
          { error: { code: 'NOT_INDEXED', message: 'Not indexed yet' } },
          { status: 409 },
        ),
    });

    await expect(api.overview('p1')).rejects.toMatchObject({
      code: 'NOT_INDEXED',
      status: 409,
    });
  });

  test('network failure raises SERVER_GONE', async () => {
    globalThis.fetch = () => Promise.reject(new TypeError('fetch failed'));
    await expect(api.projects.list()).rejects.toMatchObject({
      code: 'SERVER_GONE',
    });
  });

  test('mock serves every MVP route', () => {
    const f = getFixture();
    const pid = f.projects[0]!.id;
    const routes: [string, string][] = [
      ['GET', '/api/health'],
      ['GET', '/api/settings'],
      ['GET', '/api/providers/detect'],
      ['GET', '/api/fs/browse'],
      ['GET', '/api/projects'],
      ['GET', `/api/projects/${pid}`],
      ['GET', `/api/projects/${pid}/overview`],
      ['GET', `/api/projects/${pid}/features`],
      ['GET', `/api/projects/${pid}/features/feature%3Abilling-subscriptions`],
      ['GET', `/api/projects/${pid}/tree`],
      ['GET', `/api/projects/${pid}/nodes/file%3Alib%2Fsession.ts`],
      ['GET', `/api/projects/${pid}/nodes/file%3Alib%2Fsession.ts/source`],
      ['GET', `/api/projects/${pid}/nodes/file%3Alib%2Fsession.ts/impact`],
      ['GET', `/api/projects/${pid}/graph?level=file`],
      ['GET', `/api/projects/${pid}/find?q=session`],
      ['GET', `/api/projects/${pid}/search?q=stripe`],
      ['GET', `/api/projects/${pid}/health`],
      ['POST', `/api/projects/${pid}/ask`],
    ];
    for (const [m, u] of routes) {
      expect(
        handleMock(f, {
          method: m,
          url: u,
          body: m === 'POST' ? { question: 'Where do we handle Stripe webhooks?' } : undefined,
        }).status,
      ).toBeLessThan(400);
    }
  });
});
