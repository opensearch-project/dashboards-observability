/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudWatchTargets } from '../../../types/alerting';
import {
  CLOUDWATCH_DATASOURCE_ID,
  buildCloudWatchDatasource,
  cloudWatchDatasourceName,
  clampToDatasourceCap,
  cloudWatchDatasourcesFor,
  cloudWatchScopeDisplayLabel,
  cloudWatchScopeKeyOf,
  countCloudWatchPairs,
  countTowardDatasourceCap,
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
    // The default label isn't repeated.
    expect(cloudWatchDatasourceName('cloudwatch_us-west-2', own, 'us-west-2')).toBe(
      'CloudWatch · us-west-2'
    );
    expect(
      cloudWatchDatasourceName('cloudwatch', { ...own, label: 'Own account' }, 'us-east-1')
    ).toBe('CloudWatch · Own account · us-east-1');
    expect(cloudWatchDatasourceName('cloudwatch_eu-west-1_s1', prod, 'eu-west-1')).toBe(
      'CloudWatch · Production · eu-west-1'
    );
  });
});

describe('cloudWatchScopeDisplayLabel', () => {
  const twoProds: CloudWatchTargets = {
    ...targets,
    scopes: [
      own,
      { id: 's1', label: 'Prod', accountId: '111111111111', relation: 'other' },
      { id: 's2', label: 'Prod', relation: 'other' },
    ],
  };
  it('keeps a label that does not repeat', () => {
    expect(cloudWatchScopeDisplayLabel(twoProds, own)).toBe('CloudWatch');
  });
  it('appends the account id, or the scope id without one, to a repeated label', () => {
    expect(cloudWatchScopeDisplayLabel(twoProds, twoProds.scopes[1])).toBe('Prod (111111111111)');
    expect(cloudWatchScopeDisplayLabel(twoProds, twoProds.scopes[2])).toBe('Prod (s2)');
  });
  it('gives two scopes labelled the same distinct names and labels', () => {
    const rows = cloudWatchDatasourcesFor(twoProds, ['us-west-2']);
    expect(rows.map((d) => [d.id, d.name, d.cloudWatchScopeLabel])).toEqual([
      ['cloudwatch_us-west-2', 'CloudWatch · us-west-2', 'CloudWatch'],
      [
        'cloudwatch_us-west-2_s1',
        'CloudWatch · Prod (111111111111) · us-west-2',
        'Prod (111111111111)',
      ],
      ['cloudwatch_us-west-2_s2', 'CloudWatch · Prod (s2) · us-west-2', 'Prod (s2)'],
    ]);
  });
  it('keeps the default scope undecorated when another scope is also labelled CloudWatch', () => {
    const twoCloudWatch: CloudWatchTargets = {
      ...targets,
      scopes: [
        { ...own, accountId: '111111111111' },
        { id: 's2', label: 'CloudWatch', accountId: '222222222222', relation: 'other' },
        { id: 's3', label: 'CloudWatch', relation: 'other' },
      ],
    };
    const rows = cloudWatchDatasourcesFor(twoCloudWatch, ['us-east-1', 'us-west-2']);
    expect(rows.map((d) => [d.id, d.name, d.cloudWatchScopeLabel])).toEqual([
      ['cloudwatch', 'CloudWatch', 'CloudWatch'],
      ['cloudwatch_us-west-2', 'CloudWatch · us-west-2', 'CloudWatch'],
      ['cloudwatch_us-east-1_s2', 'CloudWatch · 222222222222 · us-east-1', '222222222222'],
      ['cloudwatch_us-west-2_s2', 'CloudWatch · 222222222222 · us-west-2', '222222222222'],
      ['cloudwatch_us-east-1_s3', 'CloudWatch · s3 · us-east-1', 's3'],
      ['cloudwatch_us-west-2_s3', 'CloudWatch · s3 · us-west-2', 's3'],
    ]);
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
  it('gives each scope a row per selected region only', () => {
    const ids = cloudWatchDatasourcesFor(targets, ['us-west-2', 'us-east-1']).map((d) => d.id);
    // Production is homed in eu-west-1, which isn't selected: no row there.
    expect(ids).toEqual([
      'cloudwatch',
      'cloudwatch_us-west-2',
      'cloudwatch_us-east-1_s1',
      'cloudwatch_us-west-2_s1',
    ]);
  });

  it('falls back to each scope default region when no offered region is selected', () => {
    expect(cloudWatchDatasourcesFor(targets, ['ap-south-1']).map((d) => d.id)).toEqual([
      'cloudwatch',
      'cloudwatch_eu-west-1_s1',
    ]);
    expect(cloudWatchDatasourcesFor(targets, []).map((d) => d.id)).toEqual([
      'cloudwatch',
      'cloudwatch_eu-west-1_s1',
    ]);
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

describe('datasource cap counting', () => {
  it('maps CloudWatch ids to their scope and other ids to nothing', () => {
    expect(cloudWatchScopeKeyOf('cloudwatch')).toBe('');
    expect(cloudWatchScopeKeyOf('cloudwatch_us-west-2')).toBe('');
    expect(cloudWatchScopeKeyOf('cloudwatch_us-west-2_s1')).toBe('s1');
    expect(cloudWatchScopeKeyOf('ds-os')).toBeUndefined();
  });

  it('counts a CloudWatch account once, whatever its regions', () => {
    expect(
      countTowardDatasourceCap([
        'ds-os',
        'prom-1',
        'cloudwatch',
        'cloudwatch_us-west-2',
        'cloudwatch_us-east-1_s1',
        'cloudwatch_us-west-2_s1',
      ])
    ).toBe(4);
    expect(countCloudWatchPairs(['ds-os', 'cloudwatch', 'cloudwatch_us-west-2'])).toBe(2);
  });

  it('clamps to the cap in input order, keeping regions of a kept account', () => {
    const ids = [
      'ds-os',
      'cloudwatch_us-east-1_a',
      'cloudwatch_us-east-1_b',
      'cloudwatch_us-west-2_a',
      'cloudwatch_us-east-1_c',
      'cloudwatch_us-west-2_b',
    ];
    expect(clampToDatasourceCap(ids, 3)).toEqual([
      'ds-os',
      'cloudwatch_us-east-1_a',
      'cloudwatch_us-east-1_b',
      'cloudwatch_us-west-2_a',
      'cloudwatch_us-west-2_b',
    ]);
  });

  it('keeps Local Cluster plus 4 accounts in 2 regions under a cap of 5', () => {
    const ids = ['ds-os'];
    for (const s of ['a', 'b', 'c', 'd']) {
      ids.push(`cloudwatch_us-east-1_${s}`, `cloudwatch_us-west-2_${s}`);
    }
    expect(clampToDatasourceCap(ids, 5)).toEqual(ids);
  });

  it('clamps to the CloudWatch pair bound', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `cloudwatch_us-east-1_s${i}`);
    expect(clampToDatasourceCap(ids, 30, 20)).toHaveLength(20);
  });
});
