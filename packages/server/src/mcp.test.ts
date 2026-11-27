import { PassThrough } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ImpactDTO, ids, sampleRunDTO } from '@catalyst/shared';
import { expect, test, vi } from 'vitest';
import { connectStdio, createMcpServer, startMcp } from './mcp.js';
import { testEngine } from './test-engine.js';

test('MCP exposes ten tools, serves impact DTOs and omits private project roots', async () => {
  const [a,b] = InMemoryTransport.createLinkedPair();
  const { project } = testEngine();
  const server = createMcpServer(project);
  const client = new Client({ name: 'test', version: '1' });
  await server.connect(a);
  await client.connect(b);
  try {
    expect((await client.listTools()).tools).toHaveLength(10);
    const response = await client.callTool({ name: 'get_blast_radius', arguments: { id: ids.sym('lib/session.ts', 'getCurrentUser') } });
    const text = (response.content as { text:string }[])[0]!.text;
    expect(ImpactDTO.parse(JSON.parse(text)).direction).toBe('up');
    const overview = await client.callTool({ name: 'get_overview', arguments: {} });
    expect(JSON.parse((overview.content as {text:string}[])[0]!.text).project).not.toHaveProperty('root');
  } finally { await client.close(); await server.close(); }
});

test('pre-aborted MCP launch skips opening a project', async () => {
  const { engine } = testEngine();
  const open = vi.spyOn(engine.projects, 'open');
  await startMcp(engine, '.', AbortSignal.abort());
  expect(open).not.toHaveBeenCalled();
});

test.each(['abort','eof'])('%s cancels a startup index and skips the transport', async reason => {
  const { engine, project, run } = testEngine();
  const info = project.info();
  project.info = () => ({ ...info, status: 'never-indexed' });
  let started!: () => void;
  const indexing = new Promise<void>(resolve => { started = resolve; });
  let finish!: () => void;
  const done = new Promise<typeof sampleRunDTO>(resolve => { finish = () => resolve({ ...sampleRunDTO, status: 'cancelled' }); });
  const cancel = vi.fn(() => finish());
  project.index = vi.fn(() => { started(); return { ...run, done, cancel }; });
  const input = new PassThrough();
  const controller = new AbortController();
  const running = connectStdio(engine, '.', input, controller.signal);
  await indexing;
  if (reason === 'abort') controller.abort();
  else input.end();
  await running;
  expect(cancel).toHaveBeenCalledOnce();
  expect(input.listenerCount('data')).toBe(0);
  expect(input.listenerCount('readable')).toBe(0);
  input.destroy();
});

test.each(['abort','eof'])('%s closes an established stdio transport and releases its readers', async reason => {
  const { engine } = testEngine();
  const input = new PassThrough();
  const controller = new AbortController();
  await connectStdio(engine, '.', input, controller.signal);
  expect(input.listenerCount('data')).toBe(1);
  if (reason === 'abort') controller.abort();
  else input.end();
  await vi.waitFor(() => expect(input.listenerCount('data')).toBe(0));
  controller.abort();
  input.destroy();
  expect(input.listenerCount('end')).toBe(0);
});
