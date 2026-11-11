/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudWatchTargets } from '../../../types/alerting';
import {
  CLOUDWATCH_DATASOURCE_ID,
  buildCloudWatchDatasource,
  cloudWatchDatasourceName,
  cloudWatchDatasourcesFor,
  decodeCloudWatchDatasourceId,
  encodeCloudWatchDatasourceId,
  isCloudWatchDatasourceId,
  resolveCloudWatchTarget,
} from '../cloudwatch_datasource_id';

const own = { label: 'CloudWatch', relation: 'own' as const, defaultRegion: 'us-east-1' };
const prod = {
  id: 's1',
  label: 'Production',
  accountId: '210987654321',
  relation: 'other' as const,
  defaultRegion: 'eu-west-1',
};
const targets: CloudWatchTargets = {
  regions: [
    { id: 'us-east-1', name: 'US East (N. Virginia)' },
    { id: 'us-west-2', name: 'US West (Oregon)' },
    { id: 'eu-west-1', name: 'Europe (Ireland)' },
  ],
  defaultRegion: 'us-east-1',
  scopes: [own, prod],
};

describe('isCloudWatchDatasourceId', () => {
  it('matches the default id and the prefixed ids only', () => {
    expect(isCloudWatchDatasourceId('cloudwatch')).toBe(true);
    expect(isCloudWatchDatasourceId('cloudwatch_us-east-1')).toBe(true);
    expect(isCloudWatchDatasourceId('cloudwatch_us-east-1_s1')).toBe(true);
    expect(isCloudWatchDatasourceId('cloudwatchx')).toBe(false);
    expect(isCloudWatchDatasourceId('ds-os')).toBe(false);
    expect(isCloudWatchDatasourceId(undefined)).toBe(false);
  });
});

describe('encode / decode', () => {
  it('maps the default scope in the default region (or no region) to `cloudwatch`', () => {
    expect(encodeCloudWatchDatasourceId({ region: 'us-east-1', defaultRegion: 'us-east-1' })).toBe(
      CLOUDWATCH_DATASOURCE_ID
    );
    expect(encodeCloudWatchDatasourceId({})).toBe(CLOUDWATCH_DATASOURCE_ID);
    expect(decodeCloudWatchDatasourceId('cloudwatch')).toEqual({});
  });

  it('round-trips the default scope in another region and a named scope', () => {
    const regional = encodeCloudWatchDatasourceId({
      region: 'us-west-2',
      defaultRegion: 'us-east-1',
    });
    expect(regional).toBe('cloudwatch_us-west-2');
    expect(decodeCloudWatchDatasourceId(regional!)).toEqual({ region: 'us-west-2' });

    const scoped = encodeCloudWatchDatasourceId({
      scopeId: 'Prod-01',
      region: 'us-gov-west-1',
      defaultRegion: 'us-east-1',
    });
    expect(scoped).toBe('cloudwatch_us-gov-west-1_Prod-01');
    expect(decodeCloudWatchDatasourceId(scoped!)).toEqual({
      region: 'us-gov-west-1',
      scopeId: 'Prod-01',
    });
  });

  it('refuses to encode invalid parts, or a named scope without a region', () => {
    expect(encodeCloudWatchDatasourceId({ region: 'US-EAST-1' })).toBeUndefined();
    expect(encodeCloudWatchDatasourceId({ scopeId: 'a_b', region: 'us-east-1' })).toBeUndefined();
    expect(
      encodeCloudWatchDatasourceId({ scopeId: 'x'.repeat(65), region: 'us-east-1' })
    ).toBeUndefined();
    expect(encodeCloudWatchDatasourceId({ scopeId: 's1' })).toBeUndefined();
  });

  it.each([
    ['not a CloudWatch id', 'ds-os'],
    ['an empty region', 'cloudwatch_'],
    ['a bad region', 'cloudwatch_useast1'],
    ['an empty scope', 'cloudwatch_us-east-1_'],
    ['a 65-character scope', `cloudwatch_us-east-1_${'a'.repeat(65)}`],
    ['four parts (an `_` in a part)', 'cloudwatch_us-east-1_s1_extra'],
    ['a bad scope character', 'cloudwatch_us-east-1_s.1'],
  ])('rejects %s', (_, id) => {
    expect(decodeCloudWatchDatasourceId(id)).toBeUndefined();
  });

  it('accepts a 64-character scope', () => {
    const scopeId = 'a'.repeat(64);
    expect(decodeCloudWatchDatasourceId(`cloudwatch_us-east-1_${scopeId}`)).toEqual({
      region: 'us-east-1',
      scopeId,
    });
  });
});

describe('resolveCloudWatchTarget', () => {
  it('resolves the legacy id to the default scope in the default region', () => {
    expect(resolveCloudWatchTarget(targets, 'cloudwatch')).toEqual({
      scope: own,
      region: 'us-east-1',
    });
  });

  it('resolves offered pairs', () => {
    expect(resolveCloudWatchTarget(targets, 'cloudwatch_us-west-2')).toEqual({
      scope: own,
      region: 'us-west-2',
    });
    expect(resolveCloudWatchTarget(targets, 'cloudwatch_us-east-1_s1')).toEqual({
      scope: prod,
      region: 'us-east-1',
    });
  });

  it.each([
    ['an unoffered region', 'cloudwatch_ap-south-1'],
    ['an unknown scope', 'cloudwatch_us-east-1_s9'],
    ['the non-canonical id of the default pair', 'cloudwatch_us-east-1'],
    ['an undecodable id', 'cloudwatch_us-east-1_s1_x'],
  ])('rejects %s', (_, id) => {
    expect(resolveCloudWatchTarget(targets, id)).toBeUndefined();
  });

  it('rejects `cloudwatch` when the source offers no default scope', () => {
    expect(resolveCloudWatchTarget({ ...targets, scopes: [prod] }, 'cloudwatch')).toBeUndefined();
  });

  it('accepts `cloudwatch` without a region when the source reports none', () => {
    const none: CloudWatchTargets = {
      regions: [],
      scopes: [{ label: 'CloudWatch', relation: 'own' }],
    };
    expect(resolveCloudWatchTarget(none, 'cloudwatch')).toEqual({
      scope: none.scopes[0],
      region: undefined,
    });
  });
});

describe('cloudWatchDatasourceName', () => {
  it("keeps today's name for the unlabeled default datasource", () => {
    expect(cloudWatchDatasourceName('cloudwatch', own, 'us-east-1')).toBe('CloudWatch');
  });

  it('names every other datasource by scope label and region', () => {
    expect(cloudWatchDatasourceName('cloudwatch_us-west-2', own, 'us-west-2')).toBe(
      'CloudWatch · CloudWatch · us-west-2'
    );
    expect(
      cloudWatchDatasourceName('cloudwatch', { ...own, label: 'Own account' }, 'us-east-1')
    ).toBe('CloudWatch · Own account · us-east-1');
    expect(cloudWatchDatasourceName('cloudwatch_eu-west-1_s1', prod, 'eu-west-1')).toBe(
      'CloudWatch · Production · eu-west-1'
    );
  });
});

describe('buildCloudWatchDatasource', () => {
  it('builds a scoped datasource with its region, scope and account', () => {
    expect(buildCloudWatchDatasource(targets, prod, 'eu-west-1')).toEqual({
      id: 'cloudwatch_eu-west-1_s1',
      name: 'CloudWatch · Production · eu-west-1',
      type: 'cloudwatch',
      url: 'cloudwatch',
      enabled: true,
      region: 'eu-west-1',
      cloudWatchScope: 's1',
      cloudWatchScopeLabel: 'Production',
      accountId: '210987654321',
    });
  });

  it('builds the default datasource without a scope id', () => {
    expect(buildCloudWatchDatasource(targets, own, 'us-east-1')).toEqual({
      id: 'cloudwatch',
      name: 'CloudWatch',
      type: 'cloudwatch',
      url: 'cloudwatch',
      enabled: true,
      region: 'us-east-1',
      cloudWatchScopeLabel: 'CloudWatch',
    });
  });

  it('returns undefined for a region the source does not offer', () => {
    expect(buildCloudWatchDatasource(targets, prod, 'ap-south-1')).toBeUndefined();
  });
});

describe('cloudWatchDatasourcesFor', () => {
  it('gives each scope a row per selected region plus its default region', () => {
    const ids = cloudWatchDatasourcesFor(targets, ['us-east-1', 'us-west-2']).map((d) => d.id);
    expect(ids).toEqual([
      'cloudwatch',
      'cloudwatch_us-west-2',
      'cloudwatch_us-east-1_s1',
      'cloudwatch_us-west-2_s1',
      // Production is homed in an unselected region; its default row is kept.
      'cloudwatch_eu-west-1_s1',
    ]);
  });

  it('ignores selected regions the source does not offer', () => {
    const ids = cloudWatchDatasourcesFor(targets, ['ap-south-1']).map((d) => d.id);
    expect(ids).toEqual(['cloudwatch', 'cloudwatch_eu-west-1_s1']);
  });

  it('gives one row per scope at its default region when the source reports no regions', () => {
    const none: CloudWatchTargets = {
      regions: [],
      scopes: [{ label: 'CloudWatch', relation: 'own' }],
    };
    expect(cloudWatchDatasourcesFor(none, ['us-east-1'])).toEqual([
      {
        id: 'cloudwatch',
        name: 'CloudWatch',
        type: 'cloudwatch',
        url: 'cloudwatch',
        enabled: true,
        cloudWatchScopeLabel: 'CloudWatch',
      },
    ]);
  });

  it('gives no rows without scopes', () => {
    expect(cloudWatchDatasourcesFor({ ...targets, scopes: [] }, ['us-east-1'])).toEqual([]);
  });
});
