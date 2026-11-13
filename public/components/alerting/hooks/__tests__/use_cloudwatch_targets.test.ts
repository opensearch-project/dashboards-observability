/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { renderHook, waitFor } from '@testing-library/react';
const mockGetTargets = jest.fn();
jest.mock('../../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    getCloudWatchTargets: mockGetTargets,
  })),
}));
jest.mock('../../../../framework/core_refs', () => ({ coreRefs: { cloudwatchEnabled: true } }));
import { coreRefs } from '../../../../framework/core_refs';
import {
  __resetCloudWatchTargetsCacheForTests,
  useCloudWatchTargets,
} from '../use_cloudwatch_targets';

const targets = {
  regions: [
    { id: 'us-east-1', name: 'us-east-1' },
    { id: 'eu-west-1', name: 'eu-west-1' },
  ],
  defaultRegion: 'us-east-1',
  scopes: [{ label: 'CloudWatch', relation: 'own' as const, defaultRegion: 'us-east-1' }],
};

beforeEach(() => {
  mockGetTargets.mockReset();
  __resetCloudWatchTargetsCacheForTests();
  (coreRefs as { cloudwatchEnabled?: boolean }).cloudwatchEnabled = true;
});

describe('useCloudWatchTargets', () => {
  it('makes no request while CloudWatch is off', () => {
    (coreRefs as { cloudwatchEnabled?: boolean }).cloudwatchEnabled = false;
    const { result } = renderHook(() => useCloudWatchTargets());
    expect(result.current).toEqual({ targets: undefined, isLoading: false });
    expect(mockGetTargets).not.toHaveBeenCalled();
  });

  it('reads the targets once for every caller', async () => {
    mockGetTargets.mockResolvedValue(targets);
    const first = renderHook(() => useCloudWatchTargets());
    const second = renderHook(() => useCloudWatchTargets());
    expect(first.result.current.isLoading).toBe(true);
    await waitFor(() => expect(first.result.current.targets).toEqual(targets));
    await waitFor(() => expect(second.result.current.targets).toEqual(targets));
    expect(first.result.current.isLoading).toBe(false);
    expect(mockGetTargets).toHaveBeenCalledTimes(1);
  });

  it('gives no targets on failure and logs only the HTTP status', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetTargets.mockRejectedValue({
      response: { status: 403 },
      body: { statusCode: 403, message: 'denied for account 123456789012' },
    });
    const { result } = renderHook(() => useCloudWatchTargets());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.targets).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).toContain('403');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('123456789012');
    warn.mockRestore();
  });
  it('reads again on the next mount after a failed read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetTargets.mockRejectedValueOnce({ response: { status: 504 } });
    mockGetTargets.mockResolvedValueOnce(targets);
    const first = renderHook(() => useCloudWatchTargets());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(first.result.current.targets).toBeUndefined();
    first.unmount();
    const second = renderHook(() => useCloudWatchTargets());
    await waitFor(() => expect(second.result.current.targets).toEqual(targets));
    expect(mockGetTargets).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
