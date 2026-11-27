import {
  NodeKind,
  NodeRef,
  type AskEvent,
  type AskRequest,
  type Lang,
  type DiffImpactDTO,
} from '@catalyst/shared';
import { z } from 'zod';
import type { QueryApi } from '../../query/types.js';
import { askTools } from './tools.js';
import { validateCitations } from './citations.js';
import { preamble } from '../prompts/shared.js';
import type { LLMClient } from '../client.js';
import type { ChatMessage } from '../providers/types.js';
const expansion = z.object({
  keywords: z.array(z.string()).min(1).max(8),
  kinds: z.array(NodeKind).optional(),
  wantsStructure: z.boolean(),
  mightNotExist: z.boolean(),
});
function answerParts(full: string) {
  const match = /\n?\s*(?:```(?:json)?\s*)?(\{\s*"found"\s*:[^\n]*\})\s*(?:```)?\s*$/.exec(full);
  if (match) {
    try {
      const data = JSON.parse(match[1]!);
      if (typeof data.found === 'boolean')
        return { markdown: full.slice(0, match.index).trim(), found: data.found };
    } catch {}
  }
  return { markdown: full.trim(), found: true };
}
// Hold only the possible trailing status block, allowing prose to stream immediately.
function visibleLength(full: string) {
  const line = full.lastIndexOf('\n') + 1;
  const tail = full.slice(line).trimStart();
  const opening = '{"found"';
  if (
    !tail ||
    tail.startsWith('```') ||
    opening.startsWith(tail) ||
    tail.replace(/\s/g, '').startsWith(opening)
  ) {
    const fence = full.slice(0, line).match(/\n```(?:json)?\s*$/);
    return fence?.index ?? Math.max(0, line - 1);
  }
  return full.length;
}
export async function* ask(
  client: LLMClient,
  q: QueryApi,
  req: AskRequest,
  abort?: AbortSignal,
): AsyncIterable<AskEvent> {
  const signal = AbortSignal.any([AbortSignal.timeout(90000), ...(abort ? [abort] : [])]);
  const lang = req.lang ?? 'en',
    tools = askTools(q, lang),
    searched = new Set<string>(),
    queries = new Set<string>();
  const messages: ChatMessage[] = [
    ...(req.history ?? []).slice(-10),
    { role: 'user', content: req.question },
  ];
  const system =
    preamble(lang) +
    ' Answer in the user’s language. Search this project and cite claims as [[nodeId]]. Before reporting absence try three distinct searches including synonyms and a structural list. End with a separate final JSON line {"found":true,"searched":[]}.';
  yield { type: 'thinking', text: lang === 'tr' ? 'Kod tabanı aranıyor…' : 'Searching the codebase…' };
  try {
    let full = '';
    if (!client.provider.supportsTools) {
      const plan = await client.object('ask', {
        tier: 'fast',
        schema: expansion,
        schemaName: 'AskExpansion',
        system: preamble(lang) + ' Expand the question into search terms with synonyms.',
        prompt: req.question,
        signal,
      });
      const scores = new Map<string, number>();
      for (const keyword of plan.keywords) {
        searched.add(keyword);
        queries.add(keyword);
        const lists = [q.find(keyword, { kinds: plan.kinds, limit: 8 }), q.search(keyword, { limit: 8 })];
        for (const list of lists)
          list.forEach((row, i) => scores.set(row.node.id, (scores.get(row.node.id) ?? 0) + 1 / (1 + i)));
      }
      const top = [...scores].sort((a, b) => b[1] - a[1]).slice(0, 20);
      const context = top.map(([id], i) => {
        const x = q.getXRay(id, lang);
        return {
          id,
          purpose: x.summary?.purpose,
          features: x.features,
          neighbors:
            i < 5 ? [...x.upstream, ...x.downstream].slice(0, 20).map((e) => [e.kind, e.node.id]) : [],
        };
      });
      const structural: Record<string, unknown> = {};
      if (plan.wantsStructure || plan.mightNotExist)
        for (const name of ['list_routes', 'list_db_models', 'list_features']) {
          structural[name] = await tools[name]!.execute({});
          searched.add(name);
        }
      full = await client.text({
        tier: 'smart',
        system,
        prompt: JSON.stringify({ messages, context, structural }).slice(0, 70000),
        signal,
      });
      yield { type: 'token', text: answerParts(full).markdown };
    } else {
      let remaining = 8;
      for (let pass = 0; pass < 2; pass++) {
        let steps = 0,
          emitted = 0;
        full = '';
        for await (const part of client.stream({
          tier: 'smart',
          messages,
          system,
          tools,
          maxSteps: remaining,
          signal,
        })) {
          signal.throwIfAborted();
          if (part.type === 'tool-call') {
            steps++;
            const args = part.args as { query?: string };
            if (['search', 'find'].includes(part.name) && typeof args?.query === 'string') {
              searched.add(args.query);
              queries.add(args.query.trim().toLowerCase());
            }
            if (part.name.startsWith('list_')) searched.add(part.name);
            yield {
              type: 'tool',
              name: part.name,
              args: part.args,
              resultSummary: part.name.replaceAll('_', ' '),
            };
          } else if (part.type === 'text-delta') {
            full += part.text;
            const end = visibleLength(full);
            if (end > emitted) {
              yield { type: 'token', text: full.slice(emitted, end) };
              emitted = end;
            }
          } else if (part.type === 'error') throw new Error('Provider stream failed');
        }
        const end = answerParts(full).markdown.length;
        if (end > emitted) yield { type: 'token', text: full.slice(emitted, end) };
        remaining -= steps + 1;
        if (
          answerParts(full).found ||
          pass ||
          remaining <= 0 ||
          (queries.size >= 3 && [...searched].some((s) => s.startsWith('list_')))
        )
          break;
        messages.push(
          { role: 'assistant', content: full },
          {
            role: 'user',
            content:
              'Search more. Try distinct synonyms and inspect a structural list before concluding that this is missing. Already checked: ' +
              JSON.stringify([...searched]),
          },
        );
      }
    }
    signal.throwIfAborted();
    if (!full.trim()) throw new Error('Provider returned no text');
    const parsed = answerParts(full);
    const checked = validateCitations(parsed.markdown, (id) => {
      try {
        return !!q.getNode(id);
      } catch {
        return false;
      }
    });
    if (
      !parsed.found &&
      client.provider.supportsTools &&
      (queries.size < 3 || ![...searched].some((s) => s.startsWith('list_')))
    ) {
      yield {
        type: 'error',
        message:
          lang === 'tr'
            ? 'Yokluk sonucuna varmak için arama yetersiz.'
            : 'The provider did not complete enough searches to support an absence claim.',
      };
      return;
    }
    yield {
      type: 'done',
      answer: {
        markdown: checked.markdown,
        found: parsed.found,
        citations: checked.citations.map((id) => NodeRef.parse(q.getNode(id))),
        searched: [...searched],
      },
    };
  } catch {
    if (abort?.aborted) throw abort.reason;
    yield {
      type: 'error',
      message: signal.aborted ? 'The request timed out.' : 'The provider could not complete the answer.',
    };
  }
}
export async function diffNarrative(client: LLMClient, diff: DiffImpactDTO, lang: Lang = 'en') {
  const nodes = new Set([...diff.changedNodes, ...diff.affected.nodes].map((n) => n.id));
  const text = await client.text({
    tier: 'smart',
    system:
      preamble(lang) +
      ' Explain the risks of these changes and what to test. Cite node IDs from the diff.',
    prompt: JSON.stringify(diff),
  });
  return validateCitations(text, (id) => nodes.has(id)).markdown;
}
