/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for `runPplPreview` — the always-resolves wrapper around
 * `coreRefs.pplService.fetch`. The friendly-message mapping is also
 * exercised here via the failure path so we don't ship regressions in
 * the user-facing copy.
 */

const mockFetch = jest.fn();

jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: {
    pplService: { fetch: (...args: unknown[]) => mockFetch(...args) },
  },
}));

import { PplPreviewResult, runPplPreview } from '../ppl_preview';

beforeEach(() => {
  mockFetch.mockReset();
});

// Type-narrowing helpers that throw on the wrong branch — keeps each
// `expect(...)` call out of a conditional, which `jest/no-conditional-expect`
// (justifiably) flags as fragile (a typo would silently skip assertions).
function asSuccess(result: PplPreviewResult): Extract<PplPreviewResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`expected success, got failure: ${result.message}`);
  }
  return result;
}

function asFailure(result: PplPreviewResult): Extract<PplPreviewResult, { ok: false }> {
  if (result.ok) {
    throw new Error('expected failure, got success');
  }
  return result;
}

describe('runPplPreview — empty / unavailable input', () => {
  it('returns a friendly message for an empty query without hitting the network', async () => {
    const result = asFailure(await runPplPreview({ query: '   ', mdsId: 'ds-1' }));
    expect(result.message.toLowerCase()).toContain('enter a ppl query');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('runPplPreview — success envelope', () => {
  it('reshapes a typical jdbc response into a normalized success', async () => {
    mockFetch.mockResolvedValueOnce({
      schema: [
        { name: 'time', type: 'timestamp' },
        { name: 'body', type: 'string' },
      ],
      datarows: [['2026-01-01', 'msg-1']],
      total: 7,
      size: 1,
      took: 42,
      jsonData: [{ time: '2026-01-01', body: 'msg-1' }],
    });

    const result = asSuccess(await runPplPreview({ query: 'source = logs', mdsId: 'mds-a' }));

    expect(result.total).toBe(7);
    expect(result.tookMs).toBe(42);
    expect(result.schema).toHaveLength(2);
    expect(result.rows).toEqual([{ time: '2026-01-01', body: 'msg-1' }]);
    expect(result.executedQuery).toBe('source = logs');
  });

  it('passes the mdsId through to PPLService.fetch', async () => {
    mockFetch.mockResolvedValueOnce({ schema: [], datarows: [], total: 0, jsonData: [] });
    await runPplPreview({ query: 'source = x', mdsId: 'mds-foo' });
    expect(mockFetch).toHaveBeenCalledWith({ query: 'source = x', format: 'jdbc' }, 'mds-foo');
  });

  it('caps the rows list to PPL_PREVIEW_MAX_ROWS', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    mockFetch.mockResolvedValueOnce({ schema: [], datarows: [], total: 20, jsonData: many });
    const result = asSuccess(await runPplPreview({ query: 'source = x' }));
    expect(result.rows.length).toBeLessThanOrEqual(2);
    expect(result.total).toBe(20);
  });

  it('falls back to row count when total is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      schema: [],
      datarows: [],
      jsonData: [{ a: 1 }, { a: 2 }],
    });
    const result = asSuccess(await runPplPreview({ query: 'source = x' }));
    expect(result.total).toBe(2);
  });
});

describe('runPplPreview — friendly-error mapping', () => {
  it('maps syntax/parse errors to the canonical syntax message', async () => {
    mockFetch.mockRejectedValueOnce({ body: { message: 'PPL: syntax error near "where"' } });
    const result = asFailure(await runPplPreview({ query: 'source = x | where' }));
    expect(result.message.toLowerCase()).toContain('invalid ppl query syntax');
    expect(result.rawMessage).toContain('syntax error');
  });

  it('maps "index not found" errors to a guided message', async () => {
    mockFetch.mockRejectedValueOnce({
      body: { message: 'no such index [nonexistent-*] not found' },
    });
    const result = asFailure(await runPplPreview({ query: 'source = nonexistent-*' }));
    expect(result.message.toLowerCase()).toContain('index not found');
  });

  it('preserves the raw cluster message for "field not found" (already useful)', async () => {
    mockFetch.mockRejectedValueOnce({
      body: { message: 'Field [error_count] not found.' },
    });
    const result = asFailure(await runPplPreview({ query: 'source = x | where error_count > 0' }));
    expect(result.message).toContain('error_count');
    expect(result.rawMessage).toBe('Field [error_count] not found.');
  });

  it('maps timeout errors to a narrowing-suggestion message', async () => {
    mockFetch.mockRejectedValueOnce({ body: { message: 'OpenSearch request timeout (30s)' } });
    const result = asFailure(await runPplPreview({ query: 'source = x' }));
    expect(result.message.toLowerCase()).toContain('query timed out');
  });

  it('maps forbidden errors to a permission message', async () => {
    mockFetch.mockRejectedValueOnce({ body: { message: 'Forbidden: access denied' } });
    const result = asFailure(await runPplPreview({ query: 'source = x' }));
    expect(result.message.toLowerCase()).toContain('do not have permission');
  });

  it('falls back to the raw message when no rule matches', async () => {
    mockFetch.mockRejectedValueOnce({ body: { message: 'something quite unique broke' } });
    const result = asFailure(await runPplPreview({ query: 'source = x' }));
    expect(result.message).toBe('something quite unique broke');
  });

  it('handles errors without a body.message gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('plain JS error'));
    const result = asFailure(await runPplPreview({ query: 'source = x' }));
    expect(result.message).toBe('plain JS error');
  });
});
