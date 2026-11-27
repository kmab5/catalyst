import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import type { Engine } from '@catalyst/core';
import { createApp } from './app.js';

export interface ServerOptions {
  port?: number;
  host?: string;
  staticDir?: string;
  token?: string;
  portRange?: number;
}
export async function startServer(engine: Engine, opts: ServerOptions = {}) {
  const port = opts.port ?? 4321;
  const host = opts.host ?? '127.0.0.1';
  const range = opts.portRange ?? 20;
  const token = opts.token ?? randomBytes(32).toString('hex');
  const app = createApp(engine, { token, staticDir: opts.staticDir });
  for (let offset = 0; offset <= range; offset++) {
    const listener = getRequestListener(app.fetch);
    const loopback = ['127.0.0.1', '::1', 'localhost'].includes(host.toLowerCase());
    const server = createServer((req, res) => {
      // A loopback server exposes repository source. Only serve the local names the UI uses.
      const authority = req.headers.host ?? '';
      if (loopback && !/^(?:localhost\.?|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(authority)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: { code: 'UNAUTHORIZED', message: 'Local server name required' },
          }),
        );
        return;
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      void listener(req, res);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port + offset, host, () => {
          server.off('error', reject);
          resolve();
        });
      });
    } catch (err) {
      if (
        (err as NodeJS.ErrnoException).code === 'EADDRINUSE' &&
        offset < range &&
        port + offset < 65535
      )
        continue;
      throw err;
    }
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
    const url = 'http://' + (host.includes(':') ? '[' + host + ']' : host) + ':' + address.port;
    return {
      url,
      port: address.port,
      token,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    };
  }
  throw new RangeError('Invalid port range');
}
