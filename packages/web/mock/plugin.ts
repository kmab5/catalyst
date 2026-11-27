import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type * as Handlers from './handlers';
import type * as Fixture from './load-fixture';

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function catalystMockPlugin(): Plugin {
  return {
    name: 'catalyst-mock-api',
    async configureServer(server) {
      const { handleMock } = await server.ssrLoadModule('/mock/handlers.ts') as typeof Handlers;
      const { loadFixture } = await server.ssrLoadModule('/mock/load-fixture.ts') as typeof Fixture;
      const fixture = loadFixture();
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url || !req.url.startsWith('/api')) {
          next();
          return;
        }
        const method = req.method ?? 'GET';
        const body = method !== 'GET' && method !== 'HEAD' ? await readJsonBody(req) : undefined;
        const result = handleMock(fixture, { method, url: req.url, body });

        if (result.headers) {
          for (const [k, v] of Object.entries(result.headers)) {
            res.setHeader(k, v);
          }
        }

        if (result.sse) {
          res.statusCode = result.status;
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          const since = Number(req.headers['last-event-id'] ?? 0);
          let id = 1;
          for (const frame of result.sse) {
            if (id <= since) { id++; continue; }
            if (res.destroyed || res.writableEnded) break;
            res.write(`event: ${frame.event}\nid: ${id++}\ndata: ${JSON.stringify(frame.data)}\n\n`);
            await new Promise((r) => setTimeout(r, frame.delayMs));
          }
          if (!res.destroyed) result.onComplete?.();
          res.end();
          return;
        }

        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(result.json ?? {}));
      });
    },
  };
}
