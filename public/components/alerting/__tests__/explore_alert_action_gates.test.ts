/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addExploreAlertSupport,
  isLogsAlertActionEnabled,
  isMetricsAlertActionEnabled,
  resetExploreAlertSupport,
} from '../explore_alert_action_gates';

// The dataset shapes the data plugin builds (index_pattern_type.ts, index_type.ts,
// prometheus_type.ts).
// An index pattern on the local cluster has no data source.
const localIndexPattern = { type: 'INDEX_PATTERN' };
// An index pattern on a data source carries the engine in `type` (and `engineType`).
const remoteIndexPattern = {
  type: 'INDEX_PATTERN',
  dataSource: { id: 'ds-1', title: 'remote', type: 'OpenSearch', engineType: 'OpenSearch' },
};
// An index on the local cluster gets DEFAULT_DATA.STRUCTURES.LOCAL_DATASOURCE.
const localIndex = {
  type: 'INDEXES',
  dataSource: { id: '', title: 'Default Cluster', type: 'DATA_SOURCE' },
};
// An index on a data source: `type` is the tree node's `DATA_SOURCE`, the engine is in
// `engineType`.
const remoteIndex = (engineType?: string) => ({
  type: 'INDEXES',
  dataSource: { id: 'ds-1', title: 'remote', type: 'DATA_SOURCE', engineType },
});
// A Prometheus connection: a data source with only `meta`, no type.
const prometheus = { type: 'PROMETHEUS', dataSource: { meta: {} } };

afterEach(() => resetExploreAlertSupport());

describe('isLogsAlertActionEnabled', () => {
  it.each([
    ['a local index pattern', localIndexPattern],
    ['an index pattern on an OpenSearch data source', remoteIndexPattern],
    ['a local index', localIndex],
    ['an index on an OpenSearch data source', remoteIndex('OpenSearch')],
    [
      'an index on a data source without a detected engine',
      remoteIndex('No Engine Type Available'),
    ],
  ])('offers the rule for PPL on %s', (_name, dataset) => {
    expect(isLogsAlertActionEnabled({ language: 'PPL', dataset }, true)).toBe(true);
    expect(isLogsAlertActionEnabled({ language: 'ppl', dataset }, true)).toBe(true);
  });

  it('stays hidden for SQL, which the flyout builds as PPL', () => {
    expect(isLogsAlertActionEnabled({ language: 'SQL', dataset: localIndexPattern }, true)).toBe(
      false
    );
  });

  it('stays hidden without PPL alerting', () => {
    expect(isLogsAlertActionEnabled({ language: 'PPL', dataset: localIndexPattern }, false)).toBe(
      false
    );
  });

  it('stays hidden on data sources whose engine it does not list', () => {
    expect(
      isLogsAlertActionEnabled({ language: 'PPL', dataset: remoteIndex('OtherEngine') }, true)
    ).toBe(false);
    expect(
      isLogsAlertActionEnabled(
        {
          language: 'PPL',
          dataset: {
            type: 'INDEX_PATTERN',
            dataSource: { id: 'ds-2', title: 'x', type: 'OtherEngine' },
          },
        },
        true
      )
    ).toBe(false);
    // An index whose engine wasn't carried over isn't assumed to be OpenSearch.
    expect(isLogsAlertActionEnabled({ language: 'PPL', dataset: remoteIndex() }, true)).toBe(false);
  });

  it('stays hidden for other languages and dataset types, and without a query', () => {
    expect(isLogsAlertActionEnabled({ language: 'PROMQL', dataset: prometheus }, true)).toBe(false);
    expect(
      isLogsAlertActionEnabled({ language: 'OtherQL', dataset: localIndexPattern }, true)
    ).toBe(false);
    expect(
      isLogsAlertActionEnabled({ language: 'PPL', dataset: { type: 'OTHER_LOGS' } }, true)
    ).toBe(false);
    expect(isLogsAlertActionEnabled(undefined, true)).toBe(false);
  });
});

describe('isMetricsAlertActionEnabled', () => {
  it('offers the rule for PromQL on a Prometheus connection', () => {
    expect(isMetricsAlertActionEnabled({ language: 'PROMQL', dataset: prometheus })).toBe(true);
  });

  it('does not depend on the data source carrying an engine type', () => {
    const typed = { type: 'PROMETHEUS', dataSource: { id: 'p', type: 'Prometheus' } };
    expect(isMetricsAlertActionEnabled({ language: 'PROMQL', dataset: typed })).toBe(true);
  });

  it("stays hidden for PromQL on another source's dataset, which has no connection", () => {
    expect(
      isMetricsAlertActionEnabled({ language: 'PROMQL', dataset: { type: 'OTHER_METRICS' } })
    ).toBe(false);
  });

  it('stays hidden for other languages and without a query', () => {
    expect(isMetricsAlertActionEnabled({ language: 'PPL', dataset: prometheus })).toBe(false);
    expect(isMetricsAlertActionEnabled(undefined)).toBe(false);
  });
});

describe('addExploreAlertSupport', () => {
  it('offers an action for a combination a deployment adds, for that action only', () => {
    const query = { language: 'PROMQL', dataset: { type: 'OTHER_PROMETHEUS' } };
    expect(isMetricsAlertActionEnabled(query)).toBe(false);

    addExploreAlertSupport('metrics', {
      datasetTypes: ['OTHER_PROMETHEUS'],
      languages: ['PROMQL'],
    });

    expect(isMetricsAlertActionEnabled(query)).toBe(true);
    expect(isLogsAlertActionEnabled(query, true)).toBe(false);
    // The built-in combinations still apply.
    expect(isMetricsAlertActionEnabled({ language: 'PROMQL', dataset: prometheus })).toBe(true);
  });

  it('can widen the data source engines an action accepts', () => {
    const query = { language: 'PPL', dataset: remoteIndex('OtherEngine') };
    addExploreAlertSupport('logs', {
      datasetTypes: ['INDEXES'],
      languages: ['PPL'],
      dataSourceTypes: ['OtherEngine'],
    });
    expect(isLogsAlertActionEnabled(query, true)).toBe(true);
  });
});
