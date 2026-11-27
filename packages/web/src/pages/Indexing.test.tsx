import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Indexing } from './Indexing';
import { getFixture, installMockFetch } from '@/test/mockFetch';
import { renderPage } from '@/test/renderPage';
import type { ProgressEvent } from '@/api/contract';

const fixture = getFixture();
const project = fixture.projects[0]!;
const runId = fixture.run.id;

class TestEvents extends EventTarget {
  static readonly CLOSED = 2;
  readonly readyState = TestEvents.CLOSED;
  static latest?: TestEvents;
  constructor() {
    super();
    TestEvents.latest = this;
  }
  close = vi.fn();
  send(event: ProgressEvent) {
    this.dispatchEvent(
      new MessageEvent(event.stage === 'done' ? 'done' : 'progress', {
        data: JSON.stringify(event),
      }),
    );
  }
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('EventSource', TestEvents);
  TestEvents.latest = undefined;
});
afterEach(() => vi.unstubAllGlobals());
function open() {
  return renderPage(<Indexing />, `/p/${project.id}/indexing`, '/p/:pid/indexing', [
    { path: '/p/:pid/overview', element: <h1>Project overview</h1> },
  ]);
}
test('shows stage counts, degradation, and navigates on completion', async () => {
  installMockFetch();
  open();
  await waitFor(() => expect(TestEvents.latest).toBeDefined());
  act(() =>
    TestEvents.latest!.send({
      runId,
      stage: 'summarize',
      done: 129,
      total: 129,
      message: 'Summarized',
      degraded: true,
    }),
  );
  expect(await screen.findByText(/sends file contents and summaries to OpenRouter/i)).toBeVisible();
  expect(screen.getByText('129/129')).toBeVisible();
  expect(screen.getByText(/Some explanations failed/)).toBeVisible();
  act(() => TestEvents.latest!.send({ runId, stage: 'done', done: 1, total: 1 }));
  expect(await screen.findByRole('heading', { name: 'Project overview' })).toBeVisible();
});
test('cancels the active run using its actual ID', async () => {
  const cancel = vi.fn(() => Response.json({ ok: true }));
  installMockFetch(fixture, { [`POST /api/projects/${project.id}/runs/${runId}/cancel`]: cancel });
  open();
  await waitFor(() => expect(TestEvents.latest).toBeDefined());
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancel).toHaveBeenCalledOnce();
});
test('offers a structural run when no provider or index exists', async () => {
  const f = getFixture();
  f.settings.provider = null;
  f.projects[0]!.lastRunId = null;
  const start = vi.fn(async (req: Request) => {
    expect(await req.json()).toEqual({ ai: false });
    return Response.json({ runId });
  });
  installMockFetch(f, { [`POST /api/projects/${project.id}/index`]: start });
  open();
  await userEvent.click(await screen.findByRole('button', { name: /Skip \(structure only\)/ }));
  expect(start).toHaveBeenCalledOnce();
});

test('recovers a completed run from disk when its live stream expired', async () => {
  installMockFetch(fixture);
  open();
  await waitFor(() => expect(TestEvents.latest).toBeDefined());
  act(() => TestEvents.latest!.dispatchEvent(new Event('error')));
  expect(await screen.findByRole('heading', { name: 'Project overview' })).toBeVisible();
});
