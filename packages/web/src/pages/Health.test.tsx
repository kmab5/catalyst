import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { installMockFetch, getFixture } from '@/test/mockFetch';
import { renderWorkflow } from '@/test/renderWorkflow';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('rule groups explain why findings matter and severity is shareable', async () => {
  vi.stubGlobal('fetch', fetch);
  installMockFetch();
  const { router } = renderWorkflow('/health');
  expect(await screen.findByRole('heading', { name: /hub/i })).toBeVisible();
  expect(screen.getAllByText(/why this matters/i).length).toBeGreaterThan(0);
  await userEvent.click(screen.getByRole('button', { name: /^High$/ }));
  expect(new URLSearchParams(router.state.location.search).get('severity')).toBe('high');
  expect(await screen.findByText(getFixture().health.flags[0]!.title)).toBeVisible();
  expect(screen.queryByText(/\/\s*100|score/i)).toBeNull();
});

test('cycle paths close at the starting node and flag links expand the evidence', async () => {
  vi.stubGlobal('fetch', fetch);
  const f = structuredClone(getFixture());
  const first = f.health.flags[0]!.node,
    second = f.health.flags[1]!.node;
  const flag = {
    ...f.health.flags[0]!,
    id: 'detected-cycle',
    rule: 'cycle',
    title: 'These files form a cycle',
    evidence: { cycle: [first.id, second.id, first.id] },
  };
  f.health.flags.push(flag);
  f.health.cycles = [{ id: flag.id, nodes: [first, second], size: 2 }];
  installMockFetch(f);
  renderWorkflow('/health?flag=detected-cycle');
  expect((await screen.findByText(flag.title)).closest('details')).toHaveAttribute('open');
  const cycles = screen.getByRole('heading', { name: 'Dependency cycles' }).parentElement!;
  const links = within(cycles).getAllByRole('link');
  expect(links.slice(0, 3).map((link) => link.textContent)).toEqual([
    first.name,
    second.name,
    first.name,
  ]);
});
