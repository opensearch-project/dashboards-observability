/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_monitor_detail hook tests — covers happy path, loading state, and
 * the `error` field exposed for the flyout to render a degraded-state
 * callout (regression coverage for ps48 M3).
 */
import { renderHook, waitFor } from '@testing-library/react';

const mockGetRuleDetail = jest.fn();

jest.mock('../../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    getRuleDetail: mockGetRuleDetail,
  })),
}));

import { useMonitorDetail } from '../use_monitor_detail';

beforeEach(() => {
  mockGetRuleDetail.mockReset();
});

describe('useMonitorDetail', () => {
  it('returns the resolved detail on success', async () => {
    const detail = { id: 'm-1', description: 'desc' };
    mockGetRuleDetail.mockResolvedValueOnce(detail);

    const { result } = renderHook(() => useMonitorDetail({ dsId: 'ds-1', ruleId: 'm-1' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.detail).toEqual(detail);
    expect(result.current.error).toBeNull();
  });

  it('exposes the error so consumers can render a degraded-state hint', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = new Error('boom');
    mockGetRuleDetail.mockRejectedValueOnce(err);

    const { result } = renderHook(() => useMonitorDetail({ dsId: 'ds-1', ruleId: 'm-1' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.detail).toBeNull();
    expect(result.current.error).toBe(err);
    consoleSpy.mockRestore();
  });

  it('wraps non-Error rejections in an Error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetRuleDetail.mockRejectedValueOnce('string-rejection');

    const { result } = renderHook(() => useMonitorDetail({ dsId: 'ds-1', ruleId: 'm-1' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('string-rejection');
    consoleSpy.mockRestore();
  });

  it('clears any prior error when the params change to a new fetch', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetRuleDetail.mockRejectedValueOnce(new Error('first failed'));
    mockGetRuleDetail.mockResolvedValueOnce({ id: 'm-2' });

    const { result, rerender } = renderHook(
      ({ ruleId }: { ruleId: string }) => useMonitorDetail({ dsId: 'ds-1', ruleId }),
      { initialProps: { ruleId: 'm-1' } }
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());

    rerender({ ruleId: 'm-2' });
    await waitFor(() => expect(result.current.detail).toEqual({ id: 'm-2' }));
    expect(result.current.error).toBeNull();
    consoleSpy.mockRestore();
  });
});
