import type { NodeRef } from '@catalyst/shared';

export function location(ref: NodeRef): string {
  return ref.filePath ? ref.filePath + (ref.startLine ? ':' + ref.startLine : '') : ref.name;
}

export function renderCitationsForTerminal(markdown: string, citations: NodeRef[]): string {
  const refs = new Map(citations.map((node) => [node.id, node]));
  const text = markdown.replace(/\[\[(.+?)\]\](?!\])/g, (_, id: string) => {
    const node = refs.get(id);
    return node ? location(node) : id;
  });
  if (!refs.size) return text;
  return text + '\n\nSources\n' + [...refs.values()].map((ref) => '  ' + location(ref)).join('\n');
}
