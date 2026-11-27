import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { AskEvent, FeatureDetailDTO, OverviewDTO, XRayDTO, ids } from '@catalyst/shared';
import { createEngine } from '../engine.js';
import { createApp } from '../../../server/src/app.js';

const fixture = fileURLToPath(new URL('../../../../fixtures/repos/ts-basic', import.meta.url));
const file = ids.file('app/api/webhooks/stripe/route.ts'),
  handler = ids.sym('app/api/webhooks/stripe/route.ts', 'POST'),
  route = ids.route('POST', '/api/webhooks/stripe'),
  model = ids.db('prisma', 'Subscription');

// A deterministic transport fixture, not an evaluation of model quality. Stage-specific replies
// use actual node IDs from ts-basic. Every completion goes through the normal AI SDK HTTP adapter.
function reply(system: string, prompt: string) {
  const tr = system.includes('Turkish');
  if (system.includes('Explain the file purpose')) {
    const path = prompt.split(' (')[0]!.slice(5);
    return {
      stage: 'summarize',
      file: path,
      value: {
        nodeId: ids.file(path),
        purpose: (tr ? 'Dosya amacı: ' : 'Purpose of ') + path,
        details: tr ? 'Kaynak dosya.' : 'Fixture source file.',
        role: 'service',
        positionInApp: '',
        sideEffects: [],
        tags: ['payments'],
        symbols: [],
        featureHints: ['billing'],
        confidence: 0.8,
      },
    };
  }
  if (system.includes('what this directory') || system.includes('this directory is responsible')) {
    const { directory, children } = JSON.parse(prompt.split('\nReturn JSON')[0]!);
    return {
      stage: 'rollup',
      value: {
        nodeId: directory,
        purpose: tr ? 'Klasör özeti' : 'Directory summary',
        details: 'Fixture directory',
        keyFiles: children.slice(0, 2).map((child: { id: string }) => child.id),
        tags: ['payments'],
      },
    };
  }
  if (system.includes('Map user-facing')) {
    // The first reply deliberately cites an unknown member; the corrective request must recover.
    const members = prompt.includes('Regenerate only these capabilities')
      ? [
          { nodeId: file, role: 'core' },
          { nodeId: route, role: 'entry' },
          { nodeId: handler, role: 'core' },
        ]
      : [{ nodeId: 'file:invented.ts', role: 'core' }];
    return {
      stage: 'features',
      value: {
        features: [
          {
            name: 'Billing',
            category: 'payments',
            summary: tr ? 'Ödemeleri işler.' : 'Processes payments.',
            description: 'Webhook billing flow.',
            entryPoints: [route],
            members,
            flows: [
              {
                name: 'Update subscription',
                trigger: 'Webhook',
                steps: [
                  { nodeId: route, action: 'Accept' },
                  { nodeId: handler, action: 'Handle' },
                  { nodeId: model, action: 'Write' },
                ],
              },
            ],
            confidence: 0.85,
          },
        ],
      },
    };
  }
  if (system.includes('Explain the app'))
    return {
      stage: 'overview',
      value: {
        name: 'Fixture',
        oneLiner: tr ? 'Ödeme uygulaması.' : 'A billing app.',
        description: 'Controlled response.',
        audience: 'Developers',
        architecture: 'Webhooks',
        stack: [],
        featureIds: ['feature:billing'],
        entryPoints: [route],
        gaps: [],
      },
    };
  if (system.includes('Assess adding'))
    return {
      stage: 'changeability',
      value: {
        addEase: { level: 'moderate', reason: 'Look at the route.' },
        changeEase: { level: 'moderate', reason: 'Uses the subscription table.' },
        removeEase: { level: 'moderate', reason: 'Review dependants.' },
        touchpoints: [file],
        risks: [],
        couplings: [],
        citesMetrics: [],
        summary: 'Review webhook consumers.',
      },
    };
  const absent = prompt.toLowerCase().includes('password reset');
  if (system.includes('Expand the question'))
    return {
      stage: 'expand',
      value: {
        keywords: absent
          ? ['password reset', 'reset token', 'forgot password']
          : ['stripe', 'webhook', 'billing'],
        wantsStructure: true,
        mightNotExist: absent,
      },
    };
  if (system.includes('Answer in the user'))
    return {
      stage: 'ask',
      value:
        (absent
          ? 'No password reset implementation was found.'
          : 'Stripe webhooks are handled by [[' + handler + ']].') +
        '\n' +
        JSON.stringify({ found: !absent, searched: [] }),
    };
  throw new Error('Unexpected test request');
}

test('Project indexing and Ask SSE use the real SDK transport, persistent graph and warm cache', async () => {
  const requests: { stage: string; file?: string }[] = [];
  const server = createServer(async (req, res) => {
    try {
      expect(req.url).toBe('/v1/chat/completions');
      let input = '';
      for await (const chunk of req) input += chunk;
      expect(input).not.toContain('FAKE_DO_NOT_READ');
      const body = JSON.parse(input);
      const response = reply(body.messages[0].content, body.messages.at(-1).content);
      requests.push({ stage: response.stage, file: response.file });
      const content =
        typeof response.value === 'string' ? response.value : JSON.stringify(response.value);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'test',
          object: 'chat.completion',
          created: 1,
          model: body.model,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
      );
    } catch {
      res.writeHead(400);
      res.end('Invalid controlled request');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const temp = await mkdtemp(join(tmpdir(), 'catalyst-ai-project-')),
    root = join(temp, 'repo');
  const engine = createEngine({ homeDir: join(temp, 'home'), env: {} });
  try {
    await cp(fixture, root, { recursive: true, filter: (path) => !path.endsWith('.catalyst') });
    engine.settings.update({
      provider: {
        type: 'openai-compatible',
        name: 'Fixture provider',
        baseUrl: 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/v1',
      },
      models: { fast: 'fixture-fast', smart: 'fixture-smart' },
    });
    const project = await engine.projects.open(root);
    const cold = await project.index({ ai: true, language: 'en' }).done;
    expect(cold.stats?.errors).toEqual([]);
    expect(cold.status).toBe('done');
    expect(project.info().aiStatus).toBe('done');
    expect(new Set(requests.map((r) => r.stage))).toEqual(
      new Set(['summarize', 'rollup', 'features', 'overview', 'changeability']),
    );
    expect(requests.filter((r) => r.stage === 'features')).toHaveLength(2);
    const q = project.query;
    expect(XRayDTO.parse(q.getXRay(file, 'en')).summary).toMatchObject({
      purpose: 'Purpose of app/api/webhooks/stripe/route.ts',
    });
    expect(q.getXRay(ids.dir('lib'), 'en').summary).toMatchObject({ purpose: 'Directory summary' });
    const billing = FeatureDetailDTO.parse(q.getFeature('feature:billing', 'en'));
    expect(billing.flows[0]?.steps.map((s) => s.edgeVerified)).toEqual([true, true, true]);
    expect(billing.changeability?.summary).toBe('Review webhook consumers.');
    expect(billing.dataModels).toContain(model);
    expect(OverviewDTO.parse(q.getOverview('en')).overview?.oneLiner).toBe('A billing app.');
    const count = requests.length,
      warm = await project.index({ ai: true, language: 'en' }).done;
    expect(warm.stats?.llmCalls).toBe(0);
    expect(requests).toHaveLength(count);
    const app = createApp(engine, { token: 'test-token' });
    for (const [question, found] of [
      ['How do Stripe webhooks work?', true],
      ['Is password reset implemented?', false],
    ] as const) {
      const response = await app.request('/api/projects/' + project.id + '/ask', {
        method: 'POST',
        headers: { 'X-Catalyst-Token': 'test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const text = await response.text();
      expect(text).toMatch(/event: ?done/);
      const events = text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => AskEvent.parse(JSON.parse(line.slice(5))));
      const done = events.at(-1);
      expect(done?.type).toBe('done');
      if (done?.type !== 'done') throw new Error('Missing answer');
      expect(done.answer.found).toBe(found);
      expect(done.answer.searched.length).toBeGreaterThanOrEqual(3);
      if (found) expect(done.answer.citations.map((n) => n.id)).toContain(handler);
    }
    expect(project.asks?.()).toHaveLength(2);
    const turkish = await project.index({ ai: true, language: 'tr' }).done;
    expect(turkish.stats?.errors).toEqual([]);
    expect(q.getOverview('tr').overview?.oneLiner).toBe('Ödeme uygulaması.');
    expect(q.getOverview('en').overview?.oneLiner).toBe('A billing app.');
    const sessionPath = join(root, 'lib', 'session.ts'),
      text = await readFile(sessionPath, 'utf8');
    await writeFile(sessionPath, text.replace('findUnique', 'findFirst'));
    const before = requests.length,
      change = await project.index({ ai: true, language: 'en' }).done;
    expect(change.status).toBe('done');
    expect(
      requests
        .slice(before)
        .filter((r) => r.stage === 'summarize')
        .map((r) => r.file),
    ).toEqual(['lib/session.ts']);
  } finally {
    await engine.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(temp, { recursive: true, force: true });
  }
}, 30000);
