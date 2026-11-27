import type { Hono } from 'hono';
import { CatalystError, type Engine } from '@catalyst/core';

export interface ServerOptions {
  port?: number;
  host?: string;
  staticDir?: string;
  token?: string;
  portRange?: number;
}

export function createApp(_engine: Engine, _opts: { token: string; staticDir?: string }): Hono {
  throw new CatalystError('NOT_IMPLEMENTED', 'createApp');
}

export async function startServer(_engine: Engine, _opts?: ServerOptions): Promise<{
  url: string; port: number; token: string; close(): Promise<void>;
}> {
  throw new CatalystError('NOT_IMPLEMENTED', 'startServer');
}
