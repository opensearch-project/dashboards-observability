/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_alerting_plugin_availability tests — covers:
 *   - probe success: `unavailable` stays false
 *   - probe failure: `unavailable` flips when every OS datasource probe fails
 *   - stale-set race: when `osIds` shrinks between probes, the old failed-set
 *     must not falsely flip the callout (joshuali925 review finding)
 *   - cleanup aborts in-flight probe controllers (ps48 M5)
 */
import { renderHook, waitFor, act } from '@testing-library/react';

const mockHttpGet = jest.fn();

jest.mock('../../../../framework/core_refs', () => ({
  coreRefs: {
    http: {
      get: (...args: unknown[]) => mockHttpGet(...args),
    },
  },
}));

import { useAlertingPluginAvailability } from '../use_alerting_plugin_availability';
import type { Datasource } from '../../../../../common/types/alerting';

const ds = (id: string, type: Datasource['type'] = 'opensearch'): Datasource => ({
  id,
  name: id,
  type,
});

beforeEach(() => {
  mockHttpGet.mockReset();
});

describe('useAlertingPluginAvailability', () => {
  it('reports unavailable=false when every probe succeeds', async () => {
    mockHttpGet.mockResolvedValue({});
    const { result } = renderHook(() => useAlertingPluginAvailability([ds('os-1')]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.unavailable).toBe(false);
    expect(result.current.unavailableDsIds).toEqual([]);
  });

  it('reports unavailable=true when every OS probe fails', async () => {
    mockHttpGet.mockRejectedValue(new Error('probe failed'));
    const { result } = renderHook(() => useAlertingPluginAvailability([ds('os-1'), ds('os-2')]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.unavailable).toBe(true);
    expect(result.current.unavailableDsIds.sort()).toEqual(['os-1', 'os-2']);
  });

  it('does not falsely flip unavailable when osIds swap stale-set members for the same length', async () => {
    // First render: one OS datasource, probe fails → failed-set = [os-1].
    mockHttpGet.mockRejectedValue(new Error('probe failed'));
    const { result, rerender } = renderHook(
      ({ datasources }: { datasources: Datasource[] }) =>
        useAlertingPluginAvailability(datasources),
      { initialProps: { datasources: [ds('os-1')] } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.unavailable).toBe(true);
    expect(result.current.unavailableDsIds).toEqual(['os-1']);

    // Now swap: user removes os-1 and adds a brand-new os-2. Lengths
    // match (1 === 1) — but until the new probe resolves,
    // `unavailableDsIds` is still [os-1] (the stale set), and the new
    // `osIds` is [os-2]. The naive predicate
    // (`unavailableDsIds.length === osIds.length`) flips `unavailable`
    // to true on the stale failed-set; the subset guard prevents that.
    let resolveProbe: () => void = () => undefined;
    mockHttpGet.mockImplementationOnce(
      () =>
        new Promise<{}>((resolve) => {
          resolveProbe = () => resolve({});
        })
    );
    rerender({ datasources: [ds('os-2')] });

    // Probe is still in flight — `unavailable` must NOT have flipped to
    // true on the strength of the stale failed-set: os-2 isn't in it.
    expect(result.current.unavailable).toBe(false);

    // Resolve the probe. os-2 succeeds: unavailable stays false.
    act(() => resolveProbe());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.unavailable).toBe(false);
  });

  it('aborts in-flight probes on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockHttpGet.mockImplementationOnce((_path: string, opts: { signal?: AbortSignal }) => {
      capturedSignal = opts?.signal;
      return new Promise<{}>(() => {
        /* never resolves */
      });
    });
    const { unmount } = renderHook(() => useAlertingPluginAvailability([ds('os-1')]));
    // Probe was issued.
    await waitFor(() => expect(mockHttpGet).toHaveBeenCalled());
    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('skips probing when no OS datasources are provided', () => {
    renderHook(() => useAlertingPluginAvailability([ds('prom-1', 'prometheus')]));
    expect(mockHttpGet).not.toHaveBeenCalled();
  });
});
