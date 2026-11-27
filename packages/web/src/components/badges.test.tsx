import { expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import { renderPage } from '@/test/renderPage';
import { getFixture } from '@/test/mockFetch';
import { ProvenanceBadge } from './ProvenanceBadge';
import { StatusPill } from './StatusPill';
test('displays inference confidence and distinguishes indexing, stale and structure-only states', () => {
  const project = getFixture().projects[0]!;
  renderPage(<>
    <ProvenanceBadge provenance="inferred" confidence={0.62} />
    <StatusPill project={project} />
    <StatusPill project={{...project, status:'stale'}} />
    <StatusPill project={{...project, activeRunId:'running'}} />
    <StatusPill project={{...project, aiStatus:'skipped'}} />
  </>);
  for (const label of ['AI-inferred · 62%', 'Ready', 'Stale', 'Indexing 0%', 'Structure only']) expect(screen.getByText(label)).toBeVisible();
});
