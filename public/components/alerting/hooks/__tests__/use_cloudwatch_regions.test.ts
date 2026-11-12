/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { act, renderHook } from '@testing-library/react';
import type { CloudWatchTargets } from '../../../../../common/types/alerting';
import { ALERT_MANAGER_CLOUDWATCH_REGIONS_STORAGE_KEY } from '../../../../../common/constants/alerting_settings';
import {
  applyCloudWatchRegionChange,
  limitDatasourceSelection,
  sanitizeCloudWatchRegions,
  useCloudWatchRegions,
} from '../use_cloudwatch_regions';

const targets: CloudWatchTargets = {
  regions: [
    { id: 'us-east-1', name: 'US East (N. Virginia)' },
    { id: 'us-west-2', name: 'US West (Oregon)' },
    { id: 'eu-west-1', name: 'Europe (Ireland)' },
  ],
  defaultRegion: 'us-east-1',
  scopes: [
    { label: 'CloudWatch', relation: 'own', accountId: '123456789012', defaultRegion: 'us-east-1' },
    { id: 'scope-b', label: 'Shared', relation: 'other', accountId: '210987654321' },
  ],
};

beforeEach(() => window.localStorage.clear());

describe('sanitizeCloudWatchRegions', () => {
  it('keeps only offered regions, de-duplicated, in input order', () => {
    expect(
      sanitizeCloudWatchRegions(['eu-west-1', 'mars-north-1', 'eu-west-1', 7, 'us-east-1'], targets)
    ).toEqual(['eu-west-1', 'us-east-1']);
  });

  it('falls back to the default region when nothing valid is left', () => {
    expect(sanitizeCloudWatchRegions(['mars-north-1'], targets)).toEqual(['us-east-1']);
    expect(sanitizeCloudWatchRegions('not an array', targets)).toEqual(['us-east-1']);
    expect(sanitizeCloudWatchRegions([], { ...targets, defaultRegion: undefined })).toEqual([]);
  });

  it('is empty without targets', () => {
    expect(sanitizeCloudWatchRegions(['us-east-1'])).toEqual([]);
  });
});

describe('useCloudWatchRegions', () => {
  it('reads the stored regions, limited to the offered ones', () => {
    window.localStorage.setItem(
      ALERT_MANAGER_CLOUDWATCH_REGIONS_STORAGE_KEY,
      JSON.stringify(['us-west-2', 'mars-north-1'])
    );
    const { result } = renderHook(() => useCloudWatchRegions(targets));
    expect(result.current.selectedRegions).toEqual(['us-west-2']);
  });

  it('starts at the default region and stores a new selection', () => {
    const { result } = renderHook(() => useCloudWatchRegions(targets));
    expect(result.current.selectedRegions).toEqual(['us-east-1']);
    act(() => result.current.setSelectedRegions(['us-east-1', 'eu-west-1', 'mars-north-1']));
    expect(result.current.selectedRegions).toEqual(['us-east-1', 'eu-west-1']);
    expect(
      JSON.parse(window.localStorage.getItem(ALERT_MANAGER_CLOUDWATCH_REGIONS_STORAGE_KEY) || '')
    ).toEqual(['us-east-1', 'eu-west-1']);
  });

  it('has no regions until targets arrive', () => {
    const { result, rerender } = renderHook(({ t }) => useCloudWatchRegions(t), {
      initialProps: { t: undefined as CloudWatchTargets | undefined },
    });
    expect(result.current.selectedRegions).toEqual([]);
    rerender({ t: targets });
    expect(result.current.selectedRegions).toEqual(['us-east-1']);
  });
});

describe('applyCloudWatchRegionChange', () => {
  const base = { targets, maxDatasources: 5 };

  it('selects an added region for every scope that already has a selection', () => {
    expect(
      applyCloudWatchRegionChange({
        ...base,
        prevRegions: ['us-east-1'],
        nextRegions: ['us-east-1', 'eu-west-1'],
        selectedDsIds: ['os-1', 'cloudwatch', 'cloudwatch_us-west-2_scope-b'],
      })
    ).toEqual({
      selectedDsIds: [
        'os-1',
        'cloudwatch',
        'cloudwatch_us-west-2_scope-b',
        'cloudwatch_eu-west-1',
        'cloudwatch_eu-west-1_scope-b',
      ],
      capReached: false,
      pairCapReached: false,
    });
  });

  it('adds nothing for scopes without a selection', () => {
    expect(
      applyCloudWatchRegionChange({
        ...base,
        prevRegions: ['us-east-1'],
        nextRegions: ['us-east-1', 'eu-west-1'],
        selectedDsIds: ['os-1', 'cloudwatch'],
      }).selectedDsIds
    ).toEqual(['os-1', 'cloudwatch', 'cloudwatch_eu-west-1']);
  });

  it("drops a removed region's ids, counting `cloudwatch` as the default region", () => {
    expect(
      applyCloudWatchRegionChange({
        ...base,
        prevRegions: ['us-east-1', 'eu-west-1'],
        nextRegions: ['eu-west-1'],
        selectedDsIds: [
          'os-1',
          'cloudwatch',
          'cloudwatch_us-east-1_scope-b',
          'cloudwatch_eu-west-1_scope-b',
        ],
      })
    ).toEqual({
      selectedDsIds: ['os-1', 'cloudwatch_eu-west-1_scope-b'],
      capReached: false,
      pairCapReached: false,
    });
  });

  it('counts an account once, so an added region never reaches the cap', () => {
    expect(
      applyCloudWatchRegionChange({
        ...base,
        maxDatasources: 2,
        prevRegions: ['us-east-1'],
        nextRegions: ['us-east-1', 'eu-west-1', 'us-west-2'],
        selectedDsIds: ['os-1', 'cloudwatch'],
      })
    ).toEqual({
      selectedDsIds: ['os-1', 'cloudwatch', 'cloudwatch_eu-west-1', 'cloudwatch_us-west-2'],
      capReached: false,
      pairCapReached: false,
    });
  });

  it('refuses a change past the CloudWatch pair bound', () => {
    const many: CloudWatchTargets = {
      ...targets,
      scopes: Array.from({ length: 11 }, (_, i) => ({
        id: `s${i}`,
        label: `Account ${i}`,
        relation: 'other' as const,
      })),
    };
    const selected = many.scopes.map((s) => `cloudwatch_us-east-1_${s.id}`);
    // 11 accounts x 2 regions = 22 pairs > 20.
    expect(
      applyCloudWatchRegionChange({
        targets: many,
        maxDatasources: 20,
        prevRegions: ['us-east-1'],
        nextRegions: ['us-east-1', 'eu-west-1'],
        selectedDsIds: selected,
      })
    ).toEqual({ selectedDsIds: selected, capReached: false, pairCapReached: true });
  });

  it('leaves the selection alone when no CloudWatch datasource is selected', () => {
    expect(
      applyCloudWatchRegionChange({
        ...base,
        prevRegions: ['us-east-1'],
        nextRegions: ['us-east-1', 'eu-west-1'],
        selectedDsIds: ['os-1'],
      })
    ).toEqual({ selectedDsIds: ['os-1'], capReached: false, pairCapReached: false });
  });
});

describe('limitDatasourceSelection', () => {
  it('accepts a change that only shrinks a selection already over the cap', () => {
    expect(limitDatasourceSelection(['a', 'b', 'c'], ['a', 'b'], 1).selectedDsIds).toEqual([
      'a',
      'b',
    ]);
  });

  it('refuses a new source past the cap', () => {
    expect(limitDatasourceSelection(['a'], ['a', 'b'], 1)).toEqual({
      selectedDsIds: ['a'],
      capReached: true,
      pairCapReached: false,
    });
  });
});
