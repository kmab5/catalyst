import type { FixtureIndex } from '../../mock/fixture-schema';
import { handleMock } from '../../mock/handlers';
import taxonomyJson from '../../../../fixtures/index/taxonomy.json';

export function getFixture(): FixtureIndex {
  return structuredClone(taxonomyJson) as unknown as FixtureIndex;
}

export function installMockFetch(
  fixture: FixtureIndex = getFixture(),
  overrides?: Record<string, (req: Request) => Response | Promise<Response>>,
): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const req = new Request(url.startsWith('/') ? `http://127.0.0.1${url}` : url, init);
    const key = `${req.method.toUpperCase()} ${new URL(req.url).pathname}`;

    if (overrides?.[key]) {
      return overrides[key]!(req);
    }
    if (overrides?.['*']) {
      return overrides['*']!(req);
    }

    let body: unknown = undefined;
    if (init?.body && typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = undefined;
      }
    }

    const res = handleMock(fixture, { method: req.method, url: req.url, body });
    const headers = new Headers(res.headers);

    if (res.sse) {
      headers.set('Content-Type', 'text/event-stream; charset=utf-8');
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          let id = 1;
          for (const frame of res.sse!) {
            controller.enqueue(
              encoder.encode(
                `event: ${frame.event}\nid: ${id++}\ndata: ${JSON.stringify(frame.data)}\n\n`,
              ),
            );
          }
          res.onComplete?.();
          controller.close();
        },
      });
      return new Response(stream, { status: res.status, headers });
    }

    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(res.json ?? {}), {
      status: res.status,
      headers,
    });
  }) as typeof fetch;
}
