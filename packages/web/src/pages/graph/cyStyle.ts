import type { StylesheetJson } from 'cytoscape';

export function cyStyle(): StylesheetJson {
  const css = getComputedStyle(document.documentElement);
  const color = (token: string, fallback: string) =>
    css.getPropertyValue('--' + token).trim() || fallback;
  const style: StylesheetJson = [
    {
      selector: 'node',
      style: {
        'background-color': color('text-muted', '#52525b'),
        color: color('text', '#18181b'),
        label: 'data(label)',
        width: 'data(size)',
        height: 'data(size)',
        'font-size': 10,
        'font-family': 'Inter, sans-serif',
        'text-valign': 'bottom',
        'text-margin-y': 4,
        'text-background-color': color('surface', '#ffffff'),
        'text-background-opacity': 0.85,
        'text-background-padding': '2px',
        'min-zoomed-font-size': 7,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 'data(weight)',
        opacity: 0.5,
        'line-color': color('text-muted', '#52525b'),
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.65,
        'target-arrow-color': color('text-muted', '#52525b'),
      },
    },
    { selector: 'edge.heuristic', style: { 'line-style': 'dashed' } },
    { selector: 'edge.inferred', style: { 'line-style': 'dotted' } },
  ];
  for (let i = 0; i < 8; i++)
    style.push({
      selector: `node[colorIndex = ${i}]`,
      style: { 'background-color': color(`feature-${i}`, '#2563eb') },
    });
  style.push(
    {
      selector: 'node.group',
      style: {
        shape: 'round-rectangle',
        'background-opacity': 0.09,
        'border-width': 1,
        'border-color': color('border', '#e4e4e7'),
        padding: '15px',
        'text-valign': 'top',
        'text-halign': 'center',
        'font-size': 11,
      },
    },
    {
      selector: 'node.high',
      style: { 'border-width': 3, 'border-color': color('sev-high', '#dc2626') },
    },
    { selector: 'node.changed', style: { 'background-color': color('feature-3', '#7c3aed') } },
    { selector: 'node.affected', style: { 'background-color': color('blast-up', '#d97706') } },
    { selector: 'node.up', style: { 'background-color': color('blast-up', '#d97706') } },
    { selector: 'node.down', style: { 'background-color': color('blast-down', '#0d9488') } },
    {
      selector: 'node.root',
      style: {
        'background-color': color('blast-root', '#2563eb'),
        'border-width': 4,
        'border-color': color('blast-root', '#2563eb'),
        'border-opacity': 0.5,
      },
    },
    { selector: '.dimmed', style: { opacity: 0.15 } },
    { selector: '.collapsed-child', style: { display: 'none' } },
  );
  return style;
}
