import { Feature, FeatureMember, Flow, FlowStep, ids, type Lang } from '@catalyst/shared';
import { z } from 'zod';
import { Snapshot, rows, bucket, type Db } from '../context.js';
import { cleanStrings } from '../ask/citations.js';
import { preamble } from '../prompts/shared.js';
import type { StageContext } from './summarize.js';
import { hash } from '../client.js';
import { PROMPT_VERSION } from '../defaults.js';
import { runReady } from './schedule.js';
const sharedId = ids.feature('shared');
const traversal = new Set([
  'handles',
  'calls',
  'renders',
  'imports',
  'reads',
  'writes',
  'calls_service',
  'contains',
]);
function reachable(s: Snapshot, from: string, to: string) {
  const queue: [string, number][] = [[from, 0]],
    visited = new Map<string, number>();
  for (let i = 0; i < queue.length; i++) {
    const [id, d] = queue[i]!;
    if (id === to) return true;
    if ((visited.get(id) ?? Infinity) <= d) continue;
    visited.set(id, d);
    const source = s.nodes.get(id);
    for (const e of s.out.get(id) ?? [])
      if (traversal.has(e.kind)) {
        const depth = d + (e.kind === 'contains' && source?.kind === 'file' ? 0 : 1);
        if (depth <= 4) queue.push([e.dst, depth]);
      }
    if (source?.kind === 'symbol' && source.file_path) queue.push([ids.file(source.file_path), d]);
  }
  return false;
}
export function newFeature(name: string, lang: Lang): Feature {
  const summary =
    lang === 'tr'
      ? 'Bağımlılık grafiğinde birlikte gruplanan dosyalar.'
      : 'Files grouped together in the dependency graph.';
  return {
    id: ids.feature(name),
    name,
    category: 'other',
    summary,
    description: summary,
    entryPoints: [],
    members: [],
    flows: [],
    dependsOn: [],
    services: [],
    dataModels: [],
    confidence: 0.3,
  };
}
export function postProcessFeatures(raw: unknown[], s: Snapshot): Feature[] {
  const features: Feature[] = [],
    used = new Set([sharedId]);
  const membership = new Map<string, string[]>();
  for (const candidate of raw) {
    const parsed = Feature.safeParse(candidate);
    if (!parsed.success) continue;
    const f = cleanStrings(parsed.data, (id) => s.nodes.has(id));
    const base = ids.feature(f.name);
    let suffix = 2;
    f.id = base;
    while (used.has(f.id)) f.id = base + '-' + suffix++;
    const seen = new Set<string>();
    f.members = f.members.filter(
      (m) => s.nodes.has(m.nodeId) && !seen.has(m.nodeId) && !!seen.add(m.nodeId),
    );
    if (!f.members.length) continue;
    used.add(f.id);
    f.confidence = Math.max(0, Math.min(0.9, f.confidence));
    delete f.changeability;
    f.entryPoints = f.entryPoints.filter((id) => s.nodes.has(id));
    f.flows = f.flows.flatMap((flow, index) => {
      const steps = flow.steps.filter((step) => s.nodes.has(step.nodeId));
      if (steps.length < 2) return [];
      let verified = 0;
      steps.forEach((step, i) => {
        step.edgeVerified = i === 0 || reachable(s, steps[i - 1]!.nodeId, step.nodeId);
        if (i && step.edgeVerified) verified++;
      });
      if (verified / (steps.length - 1) < 0.5)
        for (const step of steps) step.confidence = (step.confidence ?? f.confidence) * 0.5;
      return [{ ...flow, id: 'flow:' + f.id.slice(8) + ':' + (index + 1), steps }];
    });
    for (const m of f.members) bucket(membership, m.nodeId, f.id);
    features.push(f);
  }
  const assigned = (id: string) => membership.get(id) ?? membership.get(s.owner(id)) ?? [];
  const votes = new Map<string, string[]>();
  for (const e of s.edges)
    if (e.kind !== 'contains') {
      for (const f of assigned(e.src)) bucket(votes, s.owner(e.dst), f);
      for (const f of assigned(e.dst)) bucket(votes, s.owner(e.src), f);
    }
  for (const file of s.files) {
    const id = ids.file(file.path);
    if (assigned(id).length) continue;
    const count = new Map<string, number>();
    for (const owner of votes.get(id) ?? []) count.set(owner, (count.get(owner) ?? 0) + 1);
    const winner = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? sharedId;
    let feature = features.find((f) => f.id === winner);
    if (!feature) {
      feature = { ...newFeature(s.lang === 'tr' ? 'Ortak kod' : 'Shared code', s.lang), id: sharedId };
      features.push(feature);
    }
    feature.members.push({ nodeId: id, role: 'support' });
    bucket(membership, id, winner);
  }
  for (const f of features) {
    const services = new Set<string>(),
      models = new Set<string>(),
      counts = new Map<string, number>();
    for (const e of s.edges)
      if (e.kind !== 'contains' && assigned(e.src).includes(f.id)) {
        const target = s.nodes.get(e.dst);
        if (target?.kind === 'service') services.add(e.dst);
        if (target?.kind === 'db_model') models.add(e.dst);
        for (const other of assigned(e.dst))
          if (other !== f.id && other !== sharedId) counts.set(other, (counts.get(other) ?? 0) + 1);
      }
    f.services = [...services];
    f.dataModels = [...models];
    f.dependsOn = [...counts].filter(([, n]) => n >= 2).map(([id]) => id);
  }
  return features;
}
// Keep the graph-derived ID stable when its display name changes.
function representativePath(feature: Feature, s: Snapshot) {
  const files = feature.members.filter((m) => m.nodeId.startsWith('file:'));
  files.sort((a, b) => (s.metrics.get(b.nodeId)?.fan_in ?? 0) - (s.metrics.get(a.nodeId)?.fan_in ?? 0));
  return files[0]?.nodeId.slice(5) ?? feature.entryPoints[0] ?? feature.members[0]?.nodeId ?? feature.id;
}

const namingInstruction =
  ' Give each capability a distinct, concise name describing what the code does, grounded in its files, routes and summaries. Avoid numbered labels such as Group 1 or Feature 2.';
const placeholder = /^(?:group|grup|cluster|community|feature|module|küme|özellik|modül)(?:\s*[#:_-]?\s*\d+\b|\s*$)/iu;

async function nameFeatures(features: Feature[], graphFallback: boolean, { s, client, attempt }: StageContext) {
  const used = new Set<string>();
  const pending = features.filter((f) => {
    const name = f.name.trim().toLocaleLowerCase(s.lang);
    if (graphFallback || !name || placeholder.test(name) || used.has(name)) return true;
    used.add(name);
    return false;
  });
  let complete = true;
  for (let i = 0; i < pending.length; i += 16) {
    const batch = pending.slice(i, i + 16);
    const evidence = batch.map((f) => ({
      id: f.id,
      entryPoints: f.entryPoints.slice(0, 4),
      members: f.members.slice(0, 6).map(({ nodeId }) => ({
        nodeId, purpose: s.summaries.get(nodeId)?.value.purpose.slice(0, 150),
      })),
    }));
    const labels = await attempt('feature names ' + i, () =>
      client.object('features', {
        tier: 'fast', schemaName: 'FeatureNames',
        schema: z.object({ names: z.array(z.object({ id: z.string(), name: z.string().trim().min(1).max(80) })) }),
        system: preamble(s.lang) + namingInstruction + ' Return one name for every supplied ID, copying the ID exactly.',
        prompt: JSON.stringify(evidence),
      }),
    );
    for (const f of batch) {
      const name = labels?.names.find((label) => label.id === f.id)?.name;
      const key = name?.toLocaleLowerCase(s.lang);
      if (name && key && !placeholder.test(name) && !used.has(key)) f.name = name;
      else {
        f.name = representativePath(f, s);
        complete = false;
      }
      used.add(f.name.toLocaleLowerCase(s.lang));
    }
  }
  return complete;
}

export function deterministicFeatures(s: Snapshot): Feature[] {
  const groups = new Map<string, Feature>();
  for (const row of s.files) {
    const id = ids.file(row.path),
      group = String(s.metrics.get(id)?.community ?? row.path.split('/')[0]);
    let feature = groups.get(group);
    if (!feature) {
      const name = (s.lang === 'tr' ? 'Grup' : 'Group') + ' ' + group + ' · ' + row.path.split('/')[0];
      groups.set(group, (feature = newFeature(name, s.lang)));
    }
    feature.members.push({ nodeId: id, role: 'core' });
    for (const n of s.byFile.get(row.path) ?? [])
      if (n.kind === 'route') {
        feature.entryPoints.push(n.id);
        feature.members.push({ nodeId: n.id, role: 'entry' });
      }
  }
  const features = postProcessFeatures([...groups.values()], s);
  for (const f of features) f.name = representativePath(f, s);
  return features;
}
export function saveFeatures(s: Snapshot, features: Feature[], inputHash: string) {
  const db = s.db;
  db.transaction(() => {
    db.prepare('DELETE FROM features WHERE language=?').run(s.lang);
    db.prepare("DELETE FROM edges WHERE kind IN ('member_of','feature_depends')").run();
    db.prepare("DELETE FROM nodes WHERE kind='feature'").run();
    const put = db.prepare('INSERT INTO features VALUES(?,?,?,?,?)');
    const node = db.prepare(
      "INSERT INTO nodes(id,kind,name,provenance,confidence) VALUES(?,'feature',?,'inferred',?)",
    );
    const edge = db.prepare(
      "INSERT OR REPLACE INTO edges(src,dst,kind,provenance,confidence,data) VALUES(?,?,?,'inferred',?,?)",
    );
    for (const f of features) {
      put.run(f.id, s.lang, JSON.stringify(f), inputHash, Date.now());
      node.run(f.id, f.name, f.confidence);
      for (const m of f.members)
        edge.run(m.nodeId, f.id, 'member_of', f.confidence, JSON.stringify({ role: m.role }));
      for (const id of f.dependsOn) edge.run(f.id, id, 'feature_depends', f.confidence, null);
    }
  })();
}
export async function discover(context: StageContext) {
  const { s, client, attempt } = context;
  const index = s.files.map((f) => {
    const id = ids.file(f.path),
      sum = s.summaries.get(id)?.value;
    return {
      id,
      role: sum && 'role' in sum ? sum.role : null,
      tags: sum?.tags.slice(0, 6),
      hints: sum && 'featureHints' in sum ? sum.featureHints : [],
      community: s.metrics.get(id)?.community,
    };
  });
  const modules = [...s.summaries.values()]
    .filter((r) => !('role' in r.value))
    .map((r) => [r.value.nodeId, r.value.purpose])
    .sort((a, b) => a[0]!.localeCompare(b[0]!));
  const anchors = s.edges.filter((e) =>
    ['handles', 'reads', 'writes', 'calls_service', 'uses_env'].includes(e.kind),
  );
  const inputHash = hash(
    index,
    modules,
    anchors,
    [...s.summaries].map(([id, r]) => [id, r.inputHash]).sort(),
    s.lang,
    client.provider.modelFor('smart'),
    PROMPT_VERSION.features,
  );
  const stored = rows<{ json: string; input_hash: string }>(
    s.db,
    'SELECT json,input_hash FROM features WHERE language=?',
    s.lang,
  );
  if (stored.length && stored.every((r) => r.input_hash === inputHash)) {
    const features = stored.map((r) => Feature.parse(JSON.parse(r.json)));
    saveFeatures(s, features, inputHash);
    return features;
  }
  // Ask only for model-authored fields. The graph supplies IDs, couplings and flow verification.
  const candidate = Feature.pick({
    name: true,
    category: true,
    summary: true,
    description: true,
    entryPoints: true,
    confidence: true,
  }).extend({
    summary: z.string().max(300).describe('One plain sentence.'),
    description: z.string().max(700).describe('A short paragraph.'),
    members: z.array(FeatureMember.pick({ nodeId: true, role: true })),
    flows: z
      .array(
        Flow.pick({ name: true, trigger: true }).extend({
          steps: z
            .array(FlowStep.pick({ nodeId: true, action: true }))
            .min(2)
            .max(8),
        }),
      )
      .max(3),
  });
  const schema = z.object({ features: z.array(candidate) });
  const batchSize = Math.min(
    400,
    Math.max(1, Math.floor((index.length * 65000) / Math.max(1, JSON.stringify(index).length))),
  );
  const batches = Array.from({ length: Math.ceil(index.length / batchSize) }, (_, i) => i * batchSize);
  const outputs = new Map<number, Feature[]>();
  let complete = true;
  await runReady(
    batches,
    () => [],
    client.concurrency,
    async (i) => {
      const batch = index.slice(i, i + batchSize);
      const result = await attempt('features batch ' + i, async () => {
        const request = {
          tier: 'smart',
          schema,
          schemaName: 'Features',
          system:
            preamble(s.lang) +
            ' Map user-facing and system capabilities. Explain flows from triggers to data and services. Copy exact member and step IDs.' + namingInstruction,
          prompt: JSON.stringify({
            modules: JSON.stringify(modules).slice(0, 7000),
            anchors: JSON.stringify(anchors).slice(0, 11000),
            files: batch,
          }),
        } as const;
        const first = await client.object('features', request);
        const invalid = first.features.filter((f) => !f.members.some((m) => s.nodes.has(m.nodeId)));
        if (!invalid.length) return first;
        client.repairs.features = (client.repairs.features ?? 0) + 1;
        const corrected = await client.object('features', {
          ...request,
          prompt:
            request.prompt +
            '\nRegenerate only these capabilities. All member IDs in the previous response were missing from the index. Copy IDs exactly from FILES: ' +
            JSON.stringify(invalid.map((f) => f.name)),
        });
        const valid = first.features.filter((f) => !invalid.includes(f));
        valid.push(...corrected.features.filter((f) => f.members.some((m) => s.nodes.has(m.nodeId))));
        if (!valid.length) throw new Error('No grounded feature members');
        return { features: valid };
      });
      if (result)
        outputs.set(
          i,
          result.features.map((f) => ({
            ...f,
            id: '',
            dependsOn: [],
            services: [],
            dataModels: [],
            flows: f.flows.map((flow) => ({
              ...flow,
              id: '',
              steps: flow.steps.map((step) => ({ ...step, edgeVerified: false })),
            })),
          })),
        );
      else complete = false;
    },
  );
  const candidates = batches.flatMap((i) => outputs.get(i) ?? []);
  let output = candidates;
  if (index.length > batchSize && candidates.length) {
    const compact = candidates.map((f, i) => ({
      candidateId: String(i),
      name: f.name,
      summary: f.summary,
      entryPoints: f.entryPoints,
    }));
    const schema = z.object({
      features: z.array(z.object({ name: z.string(), mergeOf: z.array(z.string()).min(1) })),
    });
    const result = await attempt('merge', () =>
      client.object('features', {
        tier: 'smart',
        schema,
        schemaName: 'FeaturesMerge',
        system: preamble(s.lang) + ' Merge overlapping candidate capabilities by candidateId.' + namingInstruction,
        prompt: JSON.stringify(compact),
      }),
    );
    if (result)
      output = result.features.flatMap((f) => {
        const members = f.mergeOf.flatMap((id) => candidates[Number(id)] ?? []);
        return members[0]
          ? [
              {
                ...members[0],
                name: f.name,
                members: members.flatMap((x) => x.members),
                flows: members.flatMap((x) => x.flows),
                entryPoints: [...new Set(members.flatMap((x) => x.entryPoints))],
              },
            ]
          : [];
      });
    else complete = false;
  }
  const features = output.length ? postProcessFeatures(output, s) : deterministicFeatures(s);
  const named = await nameFeatures(features, !output.length, context);
  saveFeatures(s, features, complete && named && output.length ? inputHash : 'fallback');
  return features;
}
