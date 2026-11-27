import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import type { Engine } from '@catalyst/core';
import { createApp } from './app.js';

export interface ServerOptions { port?: number; host?: string; staticDir?: string; token?: string; portRange?: number }
export async function startServer(engine: Engine, opts: ServerOptions = {}) {
  const port = opts.port ?? 4321;
  const host = opts.host ?? '127.0.0.1';
  const range = opts.portRange ?? 20;
  const token = opts.token ?? randomBytes(32).toString('hex');
  const app = createApp(engine, { token, staticDir: opts.staticDir });
  for (let offset = 0; offset <= range; offset++) {
    const server = createServer(getRequestListener(app.fetch));
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port + offset, host, () => { server.off('error', reject); resolve(); });
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE' && offset < range && port + offset < 65535) continue;
      throw err;
    }
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
    const url = 'http://' + (host.includes(':') ? '[' + host + ']' : host) + ':' + address.port;
    return { url, port: address.port, token, close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }) };
  }
  throw new RangeError('Invalid port range');
}
