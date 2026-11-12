/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
const mockFind = jest.fn();
jest.mock('../../../../framework/core_refs', () => ({
  coreRefs: { savedObjectsClient: { find: (...args: unknown[]) => mockFind(...args) } },
}));
import { coreRefs } from '../../../../framework/core_refs';
import type { CloudWatchTargets } from '../../../../../common/types/alerting';
import { mapSavedObjectsToDatasources, useDatasources } from '../use_datasources';

describe('mapSavedObjectsToDatasources', () => {
  it('preserves OpenSearch engine metadata used by AD and Forecasting create gating', () => {
    const datasources = mapSavedObjectsToDatasources(
      [
        {
          id: 'os-1',
          type: 'data-source',
          references: [],
          attributes: {
            title: 'Serverless',
            endpoint: 'https://example.aoss.amazonaws.com',
            dataSourceEngineType: 'OpenSearch Serverless',
          },
        },
      ] as never,
      []
    );

    expect(datasources[0]).toEqual(
      expect.objectContaining({
        id: 'os-1',
        mdsId: 'os-1',
        engineType: 'OpenSearch Serverless',
      })
    );
  });
});

describe('useDatasources CloudWatch rows', () => {
  const targets: CloudWatchTargets = {
    regions: [
      { id: 'us-east-1', name: 'us-east-1' },
      { id: 'us-west-2', name: 'us-west-2' },
      { id: 'eu-west-1', name: 'eu-west-1' },
    ],
    defaultRegion: 'us-east-1',
    scopes: [
      { label: 'CloudWatch', relation: 'own', accountId: '123456789012' },
      {
        id: 'scope-b',
        label: 'Shared',
        relation: 'other',
        accountId: '210987654321',
        defaultRegion: 'eu-west-1',
      },
    ],
  };
  const cloudWatchRows = (datasources: Array<{ id: string; name: string; type: string }>) =>
    datasources.filter((d) => d.type === 'cloudwatch').map((d) => [d.id, d.name]);

  beforeEach(() => {
    mockFind.mockReset();
    mockFind.mockResolvedValue({ savedObjects: [] });
    (coreRefs as { cloudwatchEnabled?: boolean }).cloudwatchEnabled = true;
  });

  it("keeps today's single CloudWatch row without options", async () => {
    const { result } = renderHook(() => useDatasources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(cloudWatchRows(result.current.datasources)).toEqual([['cloudwatch', 'CloudWatch']]);
    expect(result.current.datasources.map((d) => d.id)).toEqual(['local-cluster', 'cloudwatch']);
  });

  it('lists one row per scope and selected region only', async () => {
    const { result } = renderHook(() =>
      useDatasources({ cloudWatch: { targets, regions: ['us-east-1', 'us-west-2'] } })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(cloudWatchRows(result.current.datasources)).toEqual([
      ['cloudwatch', 'CloudWatch'],
      ['cloudwatch_us-west-2', 'CloudWatch · CloudWatch · us-west-2'],
      ['cloudwatch_us-east-1_scope-b', 'CloudWatch · Shared · us-east-1'],
      ['cloudwatch_us-west-2_scope-b', 'CloudWatch · Shared · us-west-2'],
      // The scope is homed in eu-west-1, which isn't selected: no row there.
    ]);
  });

  it('lists no CloudWatch rows when the source offers no scopes', async () => {
    const { result } = renderHook(() =>
      useDatasources({ cloudWatch: { targets: { ...targets, scopes: [] }, regions: [] } })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(cloudWatchRows(result.current.datasources)).toEqual([]);
    expect(result.current.datasources.map((d) => d.id)).toEqual(['local-cluster']);
  });

  it('lists no CloudWatch rows while CloudWatch is off, even with targets', async () => {
    (coreRefs as { cloudwatchEnabled?: boolean }).cloudwatchEnabled = false;
    const { result } = renderHook(() =>
      useDatasources({ cloudWatch: { targets, regions: ['us-east-1'] } })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(cloudWatchRows(result.current.datasources)).toEqual([]);
  });

  it('stays loading while the targets load', async () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useDatasources({ cloudWatch: { targetsLoading: loading } }),
      {
        initialProps: { loading: true },
      }
    );
    await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.datasources.length).toBeGreaterThan(0));
    expect(result.current.isLoading).toBe(true);
    rerender({ loading: false });
    expect(result.current.isLoading).toBe(false);
  });
});
