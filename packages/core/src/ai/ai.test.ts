import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Changeability, FileSummary, AskEvent, EstimateDTO } from '@catalyst/shared';
import { z } from 'zod';
import { schema as ddl } from '../store/schema.js';
import type { QueryApi } from '../query/types.js';
import {
  ask,
  askTools,
  createProvider,
  estimate,
  FakeProvider,
  LLMClient,
  redactSecrets,
  runAiStages,
  validateCitations,
  writeDeterministicFeatures,
} from './index.js';
import { newFeature, postProcessFeatures } from './stages/features.js';
import { Snapshot } from './context.js';
import type { StreamPart } from './providers/types.js';

let db: Database.Database, root: string;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(ddl);
  root = mkdtempSync(join(tmpdir(), 'catalyst-ai-'));
});
afterEach(() => {
  db.close();
  rmSync(root, { force: true, recursive: true });
});
const node = (id: string, kind: string, path: string | null = null) =>
  db
    .prepare("INSERT INTO nodes(id,name,kind,file_path,provenance) VALUES(?,?,?,?,'ast')")
    .run(id, id, kind, path);
const edge = (src: string, dst: string, kind: string) =>
  db.prepare("INSERT INTO edges(src,dst,kind,provenance) VALUES(?,?,?,'ast')").run(src, dst, kind);
function fixture() {
  mkdirSync(join(root, 'lib'));
  node('dir:lib', 'directory');
  for (const name of ['leaf', 'main']) {
    const path = 'lib/' + name + '.ts',
      content =
        'const first=1;\nconst key="sk_live_0123456789abcdef";\nexport function work(){return first;}\n';
    writeFileSync(join(root, path), content);
    db.prepare(
      "INSERT INTO files(path,hash,language,tier,loc,size_bytes) VALUES(?,?,'typescript',1,3,110)",
    ).run(path, createHash('sha1').update(content).digest('hex'));
    node('file:' + path, 'file', path);
    node('sym:' + path + '#work', 'symbol', path);
    edge('dir:lib', 'file:' + path, 'contains');
    edge('file:' + path, 'sym:' + path + '#work', 'contains');
  }
  node('db:prisma:User', 'db_model');
  edge('sym:lib/leaf.ts#work', 'db:prisma:User', 'reads');
  edge('file:lib/main.ts', 'file:lib/leaf.ts', 'imports');
  node('route:GET /users', 'route', 'lib/main.ts');
  edge('route:GET /users', 'sym:lib/main.ts#work', 'handles');
}
const req = {
  tier: 'fast' as const,
  system: 'JSON',
  prompt: 'hello',
  schema: z.object({ n: z.number() }),
  schemaName: 'N',
};
test('caches validated output, retries 429 and repairs JSON once', async () => {
  const fake = new FakeProvider({
      objects: { N: ['{bad'] },
      texts: ['```json\n{"n":42,}\n```'],
      failTimes: 2,
    }),
    client = new LLMClient(fake, db);
  expect(await client.object('summarize', req)).toEqual({ n: 42 });
  expect(await client.object('summarize', req)).toEqual({ n: 42 });
  expect(fake.calls).toHaveLength(4);
  expect(client.repairs).toEqual({ summarize: 1 });
  expect(client.usage().cacheHits).toBe(1);
});
test('invalid repair is not cached', async () => {
  const fake = new FakeProvider({ objects: { N: ['bad'] }, texts: ['bad'] }),
    client = new LLMClient(fake, db);
  await expect(client.object('summarize', req)).rejects.toThrow();
  expect(fake.calls).toHaveLength(2);
  expect(db.prepare('SELECT * FROM llm_cache').all()).toHaveLength(0);
});
test('budget and cancellation stop outbound calls', async () => {
  const p = new FakeProvider({ objects: { N: [{ n: 1 }] } });
  const client = new LLMClient(p, db, { budgetUsd: 0.00001 });
  await expect(client.object('x', req)).rejects.toThrow('BUDGET');
  expect(client.budgetExceeded()).toBe(true);
  await expect(new LLMClient(p, db, { signal: AbortSignal.abort() }).object('x', req)).rejects.toThrow();
  expect(p.calls).toHaveLength(0);
});
test('redacts tokens, cloud keys, entropy assignments, PEM and JWTs', () => {
  for (const value of [
    'sk_live_123456789abcd',
    'AKIAIOSFODNN7EXAMPLE',
    'ghp_123456789abcdef',
    'xoxb-12345678901',
    'eyJfoo.aaaa.bbbb',
    '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
  ])
    expect(redactSecrets(value)).toBe('«redacted»');
  expect(redactSecrets('const api_token = "abcdefghijklmnopqrstuvwxyz123456789"')).toContain(
    '"«redacted»"',
  );
  expect(redactSecrets('const x = process.env.SECRET_KEY')).toContain('process.env.SECRET_KEY');
});
test('factory enables single-shot for CLI and local models', () => {
  expect(createProvider({ type: 'claude-code', binary: 'claude' }).supportsTools).toBe(false);
  expect(
    createProvider({ type: 'openai-compatible', baseUrl: 'http://localhost:11434/v1', name: 'local' })
      .local,
  ).toBe(true);
});
const summary = (prompt: string) => ({
  nodeId: 'unused',
  purpose: prompt.startsWith('FILE lib/leaf') ? 'Loads users' : 'Lists users',
  details: 'Uses the database.',
  role: 'data_access',
  positionInApp: 'Used by the API.',
  sideEffects: [],
  tags: ['users'],
  symbols: [{ nodeId: 'sym:missing#nope', purpose: 'invented' }],
  featureHints: ['users'],
  confidence: 0.9,
});
const card: Changeability = {
  addEase: { level: 'hard', reason: 'reason' },
  changeEase: { level: 'hard', reason: 'reason' },
  removeEase: { level: 'hard', reason: 'reason' },
  touchpoints: ['unknown'],
  risks: [],
  couplings: [],
  citesMetrics: [{ name: 'outsideImpact', value: -14 }],
  summary: 'Summary',
};
function stageProvider() {
  const feature = newFeature('Users', 'en');
  feature.members = [{ nodeId: 'file:lib/main.ts', role: 'core' }];
  feature.entryPoints = ['route:GET /users'];
  return new FakeProvider({
    objects: {
      FileSummary: summary,
      ModuleSummary: () => ({
        nodeId: 'unknown',
        purpose: 'User access',
        details: '',
        keyFiles: ['file:lib/main.ts', 'unknown'],
        tags: [],
      }),
      Features: () => ({ features: [feature] }),
      AppOverview: () => ({
        name: 'Users',
        oneLiner: 'Lists users',
        description: '',
        audience: '',
        stack: [{ name: 'Kubernetes', category: 'infra', evidence: [] }],
        architecture: '',
        featureIds: ['feature:users', 'fake'],
        entryPoints: ['route:GET /users'],
        gaps: [],
      }),
      Changeability: () => card,
    },
  });
}
test('runs grounded stages leaves-first, caches unchanged runs, stores Turkish independently', async () => {
  fixture();
  const fake = stageProvider(),
    client = new LLMClient(fake, db);
  const result = await runAiStages({ db, root, client, lang: 'en' });
  expect(result.errors).toEqual([]);
  const prompts = fake.calls.filter((c) => c.schemaName === 'FileSummary').map((c) => c.prompt);
  expect(prompts[0]).toContain('FILE lib/leaf');
  expect(prompts[1]).toContain('Loads users');
  expect(fake.calls.every((c) => !c.prompt.includes('sk_live_'))).toBe(true);
  const leaf = FileSummary.parse(
    JSON.parse(
      (
        db.prepare("SELECT json FROM summaries WHERE node_id='file:lib/leaf.ts'").get() as {
          json: string;
        }
      ).json,
    ),
  );
  expect(leaf.symbols).toEqual([]);
  expect(leaf.sideEffects).toContainEqual(
    expect.objectContaining({ kind: 'db_read', target: 'db:prisma:User' }),
  );
  const savedFeature = JSON.parse(
    (db.prepare('SELECT json FROM features LIMIT 1').get() as { json: string }).json,
  );
  expect(savedFeature.changeability.removeEase.level).toBe('moderate');
  expect(savedFeature.changeability.removeEase.reason).toContain('(adjusted)');
  expect(savedFeature.changeability.citesMetrics).toEqual([]);
  expect(
    db.prepare("SELECT 1 FROM edges WHERE kind='member_of' AND dst='feature:users'").get(),
  ).toBeTruthy();
  const prev = fake.calls.length;
  await runAiStages({ db, root, client, lang: 'en' });
  expect(fake.calls).toHaveLength(prev);
  await runAiStages({ db, root, client, lang: 'tr' });
  expect(fake.calls.slice(prev).every((c) => c.prompt.includes('Turkish'))).toBe(true);
  expect(db.prepare('SELECT DISTINCT language FROM summaries').all()).toHaveLength(2);
  expect(EstimateDTO.parse(estimate(db, 'en', fake)).filesNeedingSummary).toBe(0);
});
test('failures preserve structural fallback and mark stages degraded', async () => {
  fixture();
  const degraded: string[] = [];
  const r = await runAiStages({
    db,
    root,
    client: new LLMClient(new FakeProvider(), db),
    lang: 'en',
    onProgress: (stage, _done, _total, d) => {
      if (d) degraded.push(stage);
    },
  });
  expect(r.aiStatus).toBe('partial');
  expect(degraded).toContain('summarize');
  expect(r.errors.length).toBeGreaterThan(0);
  expect(writeDeterministicFeatures(db, 'en').every((f) => f.changeability && f.confidence === 0.3)).toBe(
    true,
  );
});
test('flow postprocessing validates endpoints and deduplicates identical names', () => {
  fixture();
  const feature = newFeature('Billing', 'en');
  feature.members = [
    { nodeId: 'file:lib/leaf.ts', role: 'core' },
    { nodeId: 'file:nope', role: 'core' },
  ];
  feature.flows = [
    {
      id: 'unknown',
      name: 'lookup',
      trigger: 'lookup',
      steps: ['route:GET /users', 'sym:lib/main.ts#work', 'file:lib/leaf.ts', 'db:prisma:User'].map(
        (nodeId) => ({ nodeId, action: 'lookup', edgeVerified: false }),
      ),
    },
  ];
  const result = postProcessFeatures([feature, feature], new Snapshot(db, 'en'));
  expect(result.map((f) => f.id)).toEqual(['feature:billing', 'feature:billing-2']);
  expect(result[0]!.flows[0]!.steps.every((s) => s.edgeVerified)).toBe(true);
  expect(result[0]!.dataModels).toContain('db:prisma:User');
});
const ref = {
  id: 'file:lib/a.ts',
  kind: 'file',
  name: 'a.ts',
  filePath: 'lib/a.ts',
  startLine: 1,
  provenance: 'ast',
};
const q = {
  getNode(id: string) {
    if (id !== ref.id) throw new Error('unknown');
    return ref;
  },
  find: () => [],
  search: () => [],
  routes: () => [],
  dataAccess: () => [],
  listFeatures: () => [],
} as unknown as QueryApi;
async function collect(stream: AsyncIterable<AskEvent>) {
  const events: AskEvent[] = [];
  for await (const e of stream) events.push(AskEvent.parse(e));
  return events;
}
test('Ask streams tool activity, validates citations and tracks actual search queries', async () => {
  const part: StreamPart = { type: 'tool-call', name: 'search', args: { query: 'billing' } };
  const p = new FakeProvider({
    streams: [
      [
        part,
        {
          type: 'text-delta',
          text: 'Read [[file:lib/a.ts]] or [[file:unknown]].\n{"found":true,"searched":["invented"]}',
        },
      ],
    ],
  });
  const events = await collect(ask(new LLMClient(p, db), q, { question: 'billing?' }));
  expect(events.map((e) => e.type)).toEqual(['thinking', 'tool', 'token', 'done']);
  expect(events.at(-1)).toMatchObject({
    answer: { markdown: 'Read [[file:lib/a.ts]] or unknown.', searched: ['billing'], citations: [ref] },
  });
  expect(validateCitations('[[dir:app/[id]]]', () => true).citations).toEqual(['dir:app/[id]']);
});
test('Ask checks absence with synonyms and structural list', async () => {
  const search = (query: string): StreamPart => ({ type: 'tool-call', name: 'search', args: { query } });
  const end: StreamPart = {
    type: 'text-delta',
    text: 'No implementation found.\n{"found":false,"searched":[]}',
  };
  const p = new FakeProvider({
    streams: [
      [search('forgot'), end],
      [search('recover'), search('reset'), { type: 'tool-call', name: 'list_routes', args: {} }, end],
    ],
  });
  const events = await collect(ask(new LLMClient(p, db), q, { question: 'Password recovery?' }));
  expect(p.calls[1]?.prompt).toContain('Search more');
  expect(events.at(-1)).toMatchObject({
    answer: { found: false, searched: ['forgot', 'recover', 'reset', 'list_routes'] },
  });
});
test('tool-free Ask expands and searches before answering', async () => {
  const p = new FakeProvider({
    supportsTools: false,
    objects: {
      AskExpansion: [{ keywords: ['users', 'people'], wantsStructure: true, mightNotExist: false }],
    },
    texts: ['See [[file:lib/a.ts]].\n{"found":true,"searched":[]}'],
  });
  const events = await collect(ask(new LLMClient(p, db), q, { question: 'Who can use it?' }));
  expect(p.calls[0]?.schemaName).toBe('AskExpansion');
  expect(events.at(-1)).toMatchObject({
    type: 'done',
    answer: { searched: ['users', 'people', 'list_routes', 'list_db_models', 'list_features'] },
  });
});
test('Ask tools redact indexed snippets and reject secret path lookup', async () => {
  const tools = askTools({
    ...q,
    search: () => [{ snippet: 'sk_live_123456789abcdef' }],
    getNode: () => ({ ...ref, filePath: '.env.example' }),
  } as unknown as QueryApi);
  expect(JSON.stringify(await tools.search!.execute({ query: 'api' }))).not.toContain('sk_live_');
  expect(await tools.read_source!.execute({ path: '.env.example' })).toHaveProperty('error');
});

test('Tier 3 requires opt-in, grounds symbol ranges and edges, and reuses cached extraction', async () => {
  fixture();
  const path = 'users.sql',
    content =
      'CREATE TABLE users (id integer);\nCREATE VIEW active AS SELECT id FROM users;\n-- sk_live_0123456789abcdef\n';
  writeFileSync(join(root, path), content);
  db.prepare("INSERT INTO files(path,hash,language,tier,loc,size_bytes) VALUES(?,?,'sql',3,3,?)").run(
    path,
    createHash('sha1').update(content).digest('hex'),
    content.length,
  );
  node('file:' + path, 'file', path);
  const fake = new FakeProvider({
    objects: {
      FileSummary: summary,
      Tier3Extraction: () => ({
        symbols: [
          {
            name: 'active',
            symbolKind: 'variable',
            startLine: 2,
            endLine: 2,
            exported: true,
            confidence: 1,
          },
          { name: 'imaginary', symbolKind: 'class', startLine: 1, endLine: 2, exported: true },
          { name: 'users', symbolKind: 'class', startLine: 999, endLine: 999, exported: true },
        ],
        edges: [
          { fromSymbol: 'active', toName: 'users', kind: 'reads', confidence: 1 },
          { fromSymbol: 'imaginary', toName: 'users', kind: 'writes' },
          { fromSymbol: 'active', toName: 'unknown', kind: 'calls' },
        ],
        summary: summary('users'),
      }),
    },
  });
  const client = new LLMClient(fake, db);
  await runAiStages({ db, root, client, lang: 'en' });
  expect(fake.calls.some((c) => c.schemaName === 'Tier3Extraction')).toBe(false);
  expect(
    fake.calls
      .filter((c) => c.schemaName === 'FileSummary')
      .every((c) => !c.prompt.includes('CREATE VIEW')),
  ).toBe(true);
  await runAiStages({ db, root, client, lang: 'en', tier3: true });
  expect(db.prepare("SELECT provenance FROM nodes WHERE id='db:sql:users'").get()).toEqual({
    provenance: 'ast',
  });
  expect(
    db.prepare("SELECT name,confidence FROM nodes WHERE file_path=? AND kind='symbol'").all(path),
  ).toEqual([{ name: 'active', confidence: 0.9 }]);
  expect(
    db
      .prepare("SELECT src,dst,provenance,confidence FROM edges WHERE kind='reads' AND file_path=?")
      .get(path),
  ).toEqual({
    src: 'sym:users.sql#active',
    dst: 'db:sql:users',
    provenance: 'inferred',
    confidence: 0.9,
  });
  expect(fake.calls.filter((c) => c.schemaName === 'Tier3Extraction')[0]?.prompt).not.toContain(
    'sk_live_',
  );
  await runAiStages({ db, root, client, lang: 'en', tier3: true });
  expect(fake.calls.filter((c) => c.schemaName === 'Tier3Extraction')).toHaveLength(1);
});
