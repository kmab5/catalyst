import { Changeability, type Feature, type Ease, type Lang } from '@catalyst/shared';
import { type Snapshot, rows } from '../context.js';
import { preamble } from '../prompts/shared.js';
import { cleanStrings } from '../ask/citations.js';
import type { StageContext } from './summarize.js';
export function changeabilityFacts(feature: Feature, features: Feature[], s: Snapshot) {
  const members = new Set(feature.members.map((m) => m.nodeId));
  const includes = (id: string) => members.has(id) || members.has(s.owner(id));
  const community = new Map<string, Set<string>>();
  for (const f of features)
    for (const m of f.members) {
      let values = community.get(m.nodeId);
      if (!values) community.set(m.nodeId, (values = new Set()));
      values.add(f.id);
    }
  const neighbors = (id: string) => community.get(id) ?? community.get(s.owner(id)) ?? new Set<string>();
  const inbound: Record<string, number> = {},
    outbound: Record<string, number> = {};
  const increment = (o: Record<string, number>, key: string) => {
    if (key !== feature.id) o[key] = (o[key] ?? 0) + 1;
  };
  const written = new Set<string>();
  for (const e of s.edges) {
    if (e.kind === 'contains') continue;
    if (includes(e.src)) {
      if (e.kind === 'writes') written.add(e.dst);
      for (const f of neighbors(e.dst)) increment(outbound, f);
    }
    if (includes(e.dst)) for (const f of neighbors(e.src)) increment(inbound, f);
  }
  const sharedWrittenModels = [...written]
    .map((id) => ({
      id,
      features: [
        ...new Set(
          (s.incoming.get(id) ?? [])
            .filter((e) => e.kind === 'reads' || e.kind === 'writes')
            .flatMap((e) => [...neighbors(e.src)]),
        ),
      ].filter((f) => f !== feature.id),
    }))
    .filter((m) => m.features.length);
  const outside = new Set<string>(),
    seen = new Set<string>(),
    queue: [string, number][] = [...s.nodes.keys()].filter(includes).map((id) => [id, 0]);
  for (let i = 0; i < queue.length; i++) {
    const [id, depth] = queue[i]!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!includes(id)) outside.add(id);
    if (depth < 3)
      for (const e of s.incoming.get(id) ?? []) if (e.kind !== 'contains') queue.push([e.src, depth + 1]);
  }
  const flags = rows<{ node_id: string; rule: string; evidence: string }>(
    s.db,
    'SELECT node_id,rule,evidence FROM flags',
  ).filter(
    (f) =>
      includes(f.node_id) ||
      (f.rule === 'cycle' && ((JSON.parse(f.evidence).cycle ?? []) as string[]).some(includes)),
  );
  const cycles = flags.filter((f) => f.rule === 'cycle'),
    god = flags.filter((f) => ['god-file', 'god-function'].includes(f.rule));
  const nodes = [...s.nodes.keys()].filter(includes);
  const paths = new Set(nodes.map((id) => s.nodes.get(id)?.file_path).filter((p): p is string => !!p));
  const steps = feature.flows.flatMap((f) => f.steps.slice(1));
  const topOutside = [...outside]
    .sort((a, b) => (s.metrics.get(b)?.fan_in ?? 0) - (s.metrics.get(a)?.fan_in ?? 0))
    .slice(0, 10);
  return {
    memberCount: members.size,
    entryPoints: feature.entryPoints,
    inbound,
    outbound,
    sharedWrittenModels,
    outsideImpact: outside.size,
    outsideFiles: new Set([...outside].map((id) => s.nodes.get(id)?.file_path).filter(Boolean)).size,
    topOutside,
    spread: new Set([...paths].map((p) => (p.includes('/') ? p.split('/')[0] : '.'))).size,
    crossCycle: cycles.some((c) =>
      (JSON.parse(c.evidence).cycle ?? []).some((id: string) => !includes(id)),
    ),
    cycles: cycles.length,
    god: god.length,
    coreGod: god.some((f) => feature.members.some((m) => m.role === 'core' && m.nodeId === f.node_id)),
    maxFanIn: Math.max(0, ...nodes.map((id) => s.metrics.get(id)?.fan_in ?? 0)),
    maxComplexity: Math.max(
      0,
      ...nodes.map((id) => s.metrics.get(id)?.complexity_max ?? s.metrics.get(id)?.complexity ?? 0),
    ),
    verified: steps.filter((step) => step.edgeVerified).length / Math.max(steps.length, 1),
  };
}
type Facts = ReturnType<typeof changeabilityFacts>;
export function suggestLevels(f: Facts): Record<'add' | 'change' | 'remove', Ease> {
  return {
    remove:
      f.outsideImpact >= 25 || f.crossCycle || f.sharedWrittenModels.some((m) => m.features.length >= 2)
        ? 'hard'
        : f.outsideImpact <= 5 && !f.sharedWrittenModels.length
          ? 'easy'
          : 'moderate',
    change:
      f.maxFanIn >= 20 || f.god || f.cycles
        ? 'hard'
        : f.memberCount <= 6 && f.maxComplexity < 10
          ? 'easy'
          : 'moderate',
    add: f.spread >= 4 || f.coreGod ? 'hard' : f.verified >= 0.5 && f.spread <= 2 ? 'easy' : 'moderate',
  };
}
function couplings(f: Facts) {
  return [...new Set([...Object.keys(f.inbound), ...Object.keys(f.outbound)])]
    .sort()
    .map((featureId) => ({
      featureId,
      edgeCount: (f.inbound[featureId] ?? 0) + (f.outbound[featureId] ?? 0),
      note: '',
    }));
}
export function fallbackCard(f: Facts, feature: Feature, lang: Lang = 'en'): Changeability {
  const levels = suggestLevels(f),
    tr = lang === 'tr';
  const summary = tr
    ? feature.name + ' kaldırılırsa dışarıdaki ' + f.outsideFiles + ' dosya etkilenir.'
    : 'Removing ' + feature.name + ' would affect ' + f.outsideFiles + ' files outside it.';
  return {
    addEase: {
      level: levels.add,
      reason: tr ? 'Dizin sayısı: ' + f.spread : 'Members span ' + f.spread + ' top-level directories.',
    },
    changeEase: {
      level: levels.change,
      reason: tr
        ? 'En yüksek karmaşıklık: ' + f.maxComplexity
        : 'Peak member complexity is ' + f.maxComplexity + '.',
    },
    removeEase: { level: levels.remove, reason: summary },
    touchpoints: feature.members.slice(0, 12).map((m) => m.nodeId),
    risks: [],
    couplings: couplings(f),
    citesMetrics: [{ name: 'outsideImpact', value: f.outsideImpact }],
    summary,
  };
}
import { runReady } from './schedule.js';
export async function grade(features: Feature[], { s, client, attempt }: StageContext) {
  await runReady(
    features,
    () => [],
    client.concurrency,
    async (feature) => {
      const facts = changeabilityFacts(feature, features, s),
        fallback = fallbackCard(facts, feature, s.lang),
        levels = suggestLevels(facts);
      const allowed = new Set([...feature.members.map((m) => m.nodeId), ...facts.topOutside]);
      const { changeability: previous, ...bare } = feature;
      const response = await attempt(feature.id, () =>
        client.object('changeability', {
          schema: Changeability,
          schemaName: 'Changeability',
          tier: 'smart',
          system:
            preamble(s.lang) +
            ' Assess adding, changing and removing this feature. Explain any change to suggested levels using cited facts.',
          prompt: JSON.stringify({ feature: bare, facts, suggested: levels, allowed: [...allowed] }),
        }),
      );
      let card = fallback;
      if (response) {
        card = cleanStrings(response, (id) => allowed.has(id));
        const order: Ease[] = ['easy', 'moderate', 'hard'];
        for (const key of ['addEase', 'changeEase', 'removeEase'] as const) {
          const current = order.indexOf(card[key].level),
            baseline = order.indexOf(fallback[key].level);
          if (Math.abs(current - baseline) > 1) {
            card[key].level = order[baseline + Math.sign(current - baseline)]!;
            card[key].reason += ' (adjusted)';
          }
        }
        card.touchpoints = card.touchpoints.filter((id) => allowed.has(id)).slice(0, 12);
        card.risks = card.risks
          .slice(0, 5)
          .map((r) => ({ ...r, nodeIds: r.nodeIds.filter((id) => allowed.has(id)) }));
        card.couplings = fallback.couplings.map((c) => ({
          ...c,
          note: card.couplings.find((v) => v.featureId === c.featureId)?.note ?? '',
        }));
        card.citesMetrics = card.citesMetrics.filter((m) =>
          m.nodeId
            ? allowed.has(m.nodeId) && s.metrics.get(m.nodeId)?.[m.name] === m.value
            : facts[m.name as keyof Facts] === m.value,
        );
      }
      feature.changeability = card;
      s.db
        .prepare('UPDATE features SET json=? WHERE language=? AND id=?')
        .run(JSON.stringify(feature), s.lang, feature.id);
    },
  );
}
