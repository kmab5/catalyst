import { afterEach, expect, test, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderPage } from '@/test/renderPage';
import { installMockFetch } from '@/test/mockFetch';
import { EstimateDialog } from './EstimateDialog';

afterEach(() => vi.unstubAllGlobals());
test.each([
  [0.42, null, /\$0\.42/],
  [null, 'Billed to your Claude plan', /Billed to your Claude plan/],
] as const)(
  'shows the provider estimate before continuing (%s, %s)',
  async (costUsd, note, expected) => {
    vi.stubGlobal('fetch', fetch);
    installMockFetch(undefined, {
      'POST /api/projects/demo/estimate': () =>
        Response.json({
          files: 12,
          filesNeedingSummary: 10,
          cachedSummaries: 2,
          llmCalls: 14,
          tokens: { in: 2000, out: 300 },
          costUsd,
          model: { fast: 'fast-model', smart: 'smart-model' },
          note,
        }),
    });
    const proceed = vi.fn();
    renderPage(
      <EstimateDialog pid="demo" onContinue={proceed} onCancel={vi.fn()} pending={false} />,
    );
    expect(await screen.findByText(/14 AI calls/)).toBeVisible();
    expect(screen.getByText(expected)).toBeVisible();
    expect(screen.getByText('10 of 12 files need a summary.')).toBeVisible();
    expect(screen.getByText('Estimated tokens: 2000 input and 300 output.')).toBeVisible();
    expect(proceed).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(proceed).toHaveBeenCalledOnce();
  },
);
