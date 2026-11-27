import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ImpactDTO, ids } from '@catalyst/shared';
import { expect, test } from 'vitest';
import { createMcpServer } from './mcp.js';
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
