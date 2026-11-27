import type { NodeRef, XRayDTO } from '@/api/contract';
import { t } from '@/i18n/t';

function location(node: NodeRef) {
  if (!node.filePath) return node.id;
  return node.filePath + (node.startLine ? ':' + node.startLine : '');
}
export function copyForAi(xray: XRayDTO): string {
  const { node, summary } = xray;
  const sections = [
    '# ' + node.name,
    node.id,
    location(node) + (node.startLine && node.endLine ? '–' + node.endLine : ''),
    xray.symbolPurpose ?? summary?.purpose,
    summary && 'positionInApp' in summary ? summary.positionInApp : undefined,
  ];
  const sectionsWithItems: [string, string[]][] = [
    [
      t('explorer.up', { n: xray.upstream.length }),
      xray.upstream.map((e) => `${e.kind} · ${location(e.node)} · ${e.node.id}`),
    ],
    [
      t('explorer.down', { n: xray.downstream.length }),
      xray.downstream.map((e) => `${e.kind} · ${location(e.node)} · ${e.node.id}`),
    ],
    [t('explorer.effects'), xray.sideEffects.map((e) => e.description)],
    [t('nav.health'), xray.flags.map((f) => f.title)],
  ];
  for (const [title, items] of sectionsWithItems) {
    if (items.length) sections.push('## ' + title, items.map((item) => '- ' + item).join('\n'));
  }
  return sections.filter(Boolean).join('\n\n');
}
