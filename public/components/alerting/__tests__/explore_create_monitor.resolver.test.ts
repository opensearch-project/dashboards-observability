/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure-function tests for `resolveAlertingDatasourceId`. Imported with a
 * lightweight module mock chain so we don't pay the React import tree —
 * the helper itself has no JSX and no DOM dependencies.
 */

// Mock the heavyweight imports the source file pulls in, so the resolver
// (a pure function) can be tested without dragging the React component
// tree (CreateMonitor → MonacoEditor → EUI → Redux) into Jest's module
// graph. Mock paths follow the same `'../<sibling>'` convention the other
// tests in this directory use — `jest.mock` resolves them relative to the
// test file's location.
jest.mock('../create_monitor', () => ({
  CreateMonitor: () => null,
}));
jest.mock('../create_monitor/create_monitor_types', () => ({
  DEFAULT_OS_FORM: {},
}));
jest.mock('../hooks/use_datasources', () => ({
  useDatasources: () => ({ datasources: [], isLoading: false }),
}));
jest.mock('../hooks/use_monitor_mutations', () => ({
  useMonitorMutations: () => ({}),
}));
jest.mock('../hooks/use_rules_data', () => ({
  useRulesData: () => ({ rules: [] }),
}));
jest.mock('../../common/toast', () => ({ useToast: () => ({ setToast: jest.fn() }) }));
jest.mock('../../../../common/services/alerting/form_transforms', () => ({
  transformPplFormToPayload: () => ({}),
}));
jest.mock('../toast_helpers', () => ({ showMonitorCreatedToast: jest.fn() }));

import { resolveAlertingDatasourceId } from '../explore_create_monitor';
import type { Datasource } from '../../../../common/types/alerting';

const ds = (over: Partial<Datasource>): Datasource => ({
  id: 'id-default',
  name: 'name-default',
  type: 'opensearch',
  url: '',
  enabled: true,
  ...over,
});

describe('resolveAlertingDatasourceId', () => {
  it('matches by mdsId first (federated/MDS path)', () => {
    const datasources: Datasource[] = [
      ds({ id: 'a', name: 'A', mdsId: 'mds-a' }),
      ds({ id: 'b', name: 'B', mdsId: 'mds-b' }),
    ];
    expect(resolveAlertingDatasourceId(datasources, { dataSourceId: 'mds-b' })).toBe('b');
  });

  it('falls through to direct id match when no mdsId aligns', () => {
    const datasources: Datasource[] = [
      ds({ id: 'plain-id-1', name: 'A' }), // no mdsId
    ];
    expect(resolveAlertingDatasourceId(datasources, { dataSourceId: 'plain-id-1' })).toBe(
      'plain-id-1'
    );
  });

  it('matches case-insensitively on name', () => {
    const datasources: Datasource[] = [ds({ id: 'a', name: 'Local Cluster' })];
    expect(resolveAlertingDatasourceId(datasources, { dataSourceName: 'local cluster' })).toBe('a');
  });

  it('matches across underscore/dash/space variants in names', () => {
    // Real-world case from MDS deployments: catalog has `local_cluster`,
    // Explore reports `Local Cluster`.
    const datasources: Datasource[] = [ds({ id: 'a', name: 'local_cluster', mdsId: 'mds-a' })];
    expect(resolveAlertingDatasourceId(datasources, { dataSourceName: 'Local Cluster' })).toBe('a');
  });

  it('picks the no-mdsId local row when no dataSourceId is provided', () => {
    const datasources: Datasource[] = [
      ds({ id: 'remote', name: 'Remote', mdsId: 'mds-r' }),
      ds({ id: 'local', name: 'Local Cluster' }), // no mdsId
    ];
    expect(resolveAlertingDatasourceId(datasources, { dataSourceId: undefined })).toBe('local');
  });

  it('falls back to a single OS row when no other signal matches', () => {
    // The real reproduction from the user's screenshots: Explore omitted
    // `dataSource` entirely. Catalog has exactly one OS row. Pick it.
    const datasources: Datasource[] = [
      ds({ id: 'only-os', name: 'local_cluster', mdsId: 'mds-only-os' }),
      // Prometheus rows are filtered out by the resolver, so they don't
      // count toward the single-row check.
      ds({ id: 'prom', name: 'Prom', type: 'prometheus' }),
    ];
    expect(resolveAlertingDatasourceId(datasources, {})).toBe('only-os');
  });

  it('returns undefined when nothing fits and there is more than one OS row', () => {
    const datasources: Datasource[] = [
      ds({ id: 'a', name: 'A', mdsId: 'mds-a' }),
      ds({ id: 'b', name: 'B', mdsId: 'mds-b' }),
    ];
    expect(
      resolveAlertingDatasourceId(datasources, {
        dataSourceId: 'unknown',
        dataSourceName: 'unknown',
      })
    ).toBeUndefined();
  });

  it('returns undefined when the catalog is empty', () => {
    expect(resolveAlertingDatasourceId([], { dataSourceId: 'anything' })).toBeUndefined();
  });

  it('ignores prometheus rows when scoring matches', () => {
    const datasources: Datasource[] = [
      ds({ id: 'prom', name: 'local_cluster', type: 'prometheus' }),
      ds({ id: 'os', name: 'local_cluster', mdsId: 'mds-os' }),
    ];
    // Should pick the OS row, not the Prometheus one — even though both
    // match by name.
    expect(resolveAlertingDatasourceId(datasources, { dataSourceName: 'local_cluster' })).toBe(
      'os'
    );
  });
});
