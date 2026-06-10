/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Smoke + stale-state tests for `PplPreviewPanel`. The pure helpers
 * (`orderSchemaForPreview`, `extractWhereFieldNames`, `runPplPreview`) are
 * tested separately; this file covers the rendering/state behavior.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockRunPplPreview = jest.fn();

jest.mock('../ppl_preview', () => {
  const actual = jest.requireActual('../ppl_preview');
  return {
    ...actual,
    runPplPreview: (...args: unknown[]) => mockRunPplPreview(...args),
  };
});

import { PplPreviewPanel } from '../ppl_preview_panel';
import type { PplPreviewResult } from '../ppl_preview';

beforeEach(() => {
  mockRunPplPreview.mockReset();
});

describe('PplPreviewPanel', () => {
  it('renders the run-preview button without crashing', () => {
    render(<PplPreviewPanel query="source = x" mdsId="mds-a" hasDatasource />);
    expect(screen.getByTestId('alertManagerPplPreviewRun')).toBeInTheDocument();
  });

  it('disables the button when no datasource is selected', () => {
    render(<PplPreviewPanel query="source = x" hasDatasource={false} />);
    const btn = screen.getByTestId('alertManagerPplPreviewRun') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables the button when the query is empty', () => {
    render(<PplPreviewPanel query="   " mdsId="mds-a" hasDatasource />);
    const btn = screen.getByTestId('alertManagerPplPreviewRun') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('renders the success panel after a click', async () => {
    mockRunPplPreview.mockResolvedValueOnce({
      ok: true,
      total: 3,
      tookMs: 12,
      schema: [{ name: 'time', type: 'timestamp' }],
      rows: [{ time: '2026-01-01' }],
      executedQuery: 'source = x',
    });

    render(<PplPreviewPanel query="source = x" mdsId="mds-a" hasDatasource />);
    fireEvent.click(screen.getByTestId('alertManagerPplPreviewRun'));

    await waitFor(() =>
      expect(screen.getByTestId('alertManagerPplPreviewSuccess')).toBeInTheDocument()
    );
  });

  it('renders the error callout when the helper resolves to a failure', async () => {
    mockRunPplPreview.mockResolvedValueOnce({
      ok: false,
      message: 'Friendly error message',
      rawMessage: 'Raw cluster gibberish',
    });

    render(<PplPreviewPanel query="source = x" mdsId="mds-a" hasDatasource />);
    fireEvent.click(screen.getByTestId('alertManagerPplPreviewRun'));

    await waitFor(() =>
      expect(screen.getByTestId('alertManagerPplPreviewError')).toBeInTheDocument()
    );
  });

  it('shows the zero-rows callout when total is 0', async () => {
    mockRunPplPreview.mockResolvedValueOnce({
      ok: true,
      total: 0,
      schema: [],
      rows: [],
      executedQuery: 'source = x',
    });

    render(<PplPreviewPanel query="source = x" mdsId="mds-a" hasDatasource />);
    fireEvent.click(screen.getByTestId('alertManagerPplPreviewRun'));

    await waitFor(() =>
      expect(screen.getByTestId('alertManagerPplPreviewZeroRows')).toBeInTheDocument()
    );
  });

  it('clears the previous result when the query prop changes', async () => {
    mockRunPplPreview.mockResolvedValueOnce({
      ok: true,
      total: 3,
      schema: [{ name: 'time', type: 'timestamp' }],
      rows: [{ time: '2026-01-01' }],
      executedQuery: 'source = old',
    });

    const { rerender } = render(
      <PplPreviewPanel query="source = old" mdsId="mds-a" hasDatasource />
    );
    fireEvent.click(screen.getByTestId('alertManagerPplPreviewRun'));
    await waitFor(() =>
      expect(screen.getByTestId('alertManagerPplPreviewSuccess')).toBeInTheDocument()
    );

    // User edits the query — stale "✓ Returned 3 rows" must not linger.
    await act(async () => {
      rerender(<PplPreviewPanel query="source = new" mdsId="mds-a" hasDatasource />);
    });
    expect(screen.queryByTestId('alertManagerPplPreviewSuccess')).not.toBeInTheDocument();
  });

  it('clears the previous result when the mdsId prop changes', async () => {
    mockRunPplPreview.mockResolvedValueOnce({
      ok: true,
      total: 1,
      schema: [],
      rows: [],
      executedQuery: 'source = x',
    });

    const { rerender } = render(<PplPreviewPanel query="source = x" mdsId="mds-a" hasDatasource />);
    fireEvent.click(screen.getByTestId('alertManagerPplPreviewRun'));
    await waitFor(() =>
      expect(screen.getByTestId('alertManagerPplPreviewSuccess')).toBeInTheDocument()
    );

    await act(async () => {
      rerender(<PplPreviewPanel query="source = x" mdsId="mds-b" hasDatasource />);
    });
    expect(screen.queryByTestId('alertManagerPplPreviewSuccess')).not.toBeInTheDocument();
  });

  it('drops a stale in-flight result when the query changes mid-fetch', async () => {
    // Regression for the M1 review finding. Without the runId guard, a
    // late-arriving response from the original query would write its rows
    // back into the panel after the user had already edited the query
    // (which clears `result` via the prop-change effect).
    let resolveFirst!: (r: PplPreviewResult) => void;
    mockRunPplPreview.mockImplementationOnce(
      () =>
        new Promise<PplPreviewResult>((resolve) => {
          resolveFirst = resolve;
        })
    );

    const { rerender } = render(
      <PplPreviewPanel query="source = old" mdsId="mds-a" hasDatasource />
    );
    fireEvent.click(screen.getByTestId('alertManagerPplPreviewRun'));

    // User edits the query before the in-flight request resolves.
    await act(async () => {
      rerender(<PplPreviewPanel query="source = new" mdsId="mds-a" hasDatasource />);
    });
    expect(screen.queryByTestId('alertManagerPplPreviewSuccess')).not.toBeInTheDocument();

    // Late response from the now-stale query arrives. The success panel
    // must NOT reappear.
    await act(async () => {
      resolveFirst({
        ok: true,
        total: 99,
        schema: [],
        rows: [],
        executedQuery: 'source = old',
      });
      await Promise.resolve();
    });
    expect(screen.queryByTestId('alertManagerPplPreviewSuccess')).not.toBeInTheDocument();
  });

  it('does not setState after unmount', async () => {
    // Regression for L1. A late response after the panel unmounts (parent
    // flyout closed mid-fetch) must not call setResult/setLoading on the
    // unmounted component — React would log a "state update on unmounted
    // component" warning, which we treat as a bug.
    let resolveFetch!: (r: PplPreviewResult) => void;
    mockRunPplPreview.mockImplementationOnce(
      () =>
        new Promise<PplPreviewResult>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<PplPreviewPanel query="source = x" mdsId="mds-a" hasDatasource />);
    fireEvent.click(screen.getByTestId('alertManagerPplPreviewRun'));
    unmount();

    await act(async () => {
      resolveFetch({
        ok: true,
        total: 1,
        schema: [],
        rows: [],
        executedQuery: 'source = x',
      });
      await Promise.resolve();
    });

    const warnedAboutUnmount = errSpy.mock.calls.some((args) =>
      args.some(
        (a) => typeof a === 'string' && a.includes('state update on an unmounted component')
      )
    );
    expect(warnedAboutUnmount).toBe(false);
    errSpy.mockRestore();
  });
});
