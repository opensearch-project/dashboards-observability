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

const localIndexPattern = { type: 'INDEX_PATTERN' };
const remoteIndexPattern = { type: 'INDEX_PATTERN', dataSource: { type: 'OpenSearch' } };
const prometheus = { type: 'PROMETHEUS' };

afterEach(() => resetExploreAlertSupport());

describe('isLogsAlertActionEnabled', () => {
  it.each(['PPL', 'SQL', 'ppl'])('offers the rule for %s on an index pattern', (language) => {
    expect(isLogsAlertActionEnabled({ language, dataset: localIndexPattern }, true)).toBe(true);
    expect(isLogsAlertActionEnabled({ language, dataset: remoteIndexPattern }, true)).toBe(true);
  });

  it('offers the rule on an index', () => {
    expect(isLogsAlertActionEnabled({ language: 'PPL', dataset: { type: 'INDEXES' } }, true)).toBe(
      true
    );
  });

  it('stays hidden without PPL alerting', () => {
    expect(isLogsAlertActionEnabled({ language: 'PPL', dataset: localIndexPattern }, false)).toBe(
      false
    );
  });

  it('stays hidden on the Metrics page', () => {
    expect(isLogsAlertActionEnabled({ language: 'PROMQL', dataset: prometheus }, true)).toBe(false);
  });

  it('stays hidden for a language, dataset type or data source it does not list', () => {
    expect(
      isLogsAlertActionEnabled({ language: 'OtherQL', dataset: localIndexPattern }, true)
    ).toBe(false);
    expect(
      isLogsAlertActionEnabled({ language: 'PPL', dataset: { type: 'OTHER_LOGS' } }, true)
    ).toBe(false);
    expect(
      isLogsAlertActionEnabled(
        {
          language: 'PPL',
          dataset: { type: 'INDEX_PATTERN', dataSource: { type: 'OtherEngine' } },
        },
        true
      )
    ).toBe(false);
    expect(isLogsAlertActionEnabled(undefined, true)).toBe(false);
  });
});

describe('isMetricsAlertActionEnabled', () => {
  it('offers the rule for PromQL on a Prometheus connection', () => {
    expect(isMetricsAlertActionEnabled({ language: 'PROMQL', dataset: prometheus })).toBe(true);
  });

  it("stays hidden for PromQL on another source's dataset, which has no connection", () => {
    expect(
      isMetricsAlertActionEnabled({ language: 'PROMQL', dataset: { type: 'OTHER_METRICS' } })
    ).toBe(false);
  });

  it('stays hidden for other languages, unlisted data sources, and without a query', () => {
    expect(isMetricsAlertActionEnabled({ language: 'PPL', dataset: prometheus })).toBe(false);
    expect(
      isMetricsAlertActionEnabled({
        language: 'PROMQL',
        dataset: { type: 'PROMETHEUS', dataSource: { type: 'OtherEngine' } },
      })
    ).toBe(false);
    expect(isMetricsAlertActionEnabled(undefined)).toBe(false);
  });
});

describe('addExploreAlertSupport', () => {
  it('offers an action for a combination a deployment adds, for that action only', () => {
    const query = { language: 'OtherQL', dataset: { type: 'OTHER_METRICS' } };
    expect(isMetricsAlertActionEnabled(query)).toBe(false);

    addExploreAlertSupport('metrics', { datasetTypes: ['OTHER_METRICS'], languages: ['OtherQL'] });

    expect(isMetricsAlertActionEnabled(query)).toBe(true);
    expect(isLogsAlertActionEnabled(query, true)).toBe(false);
    // The built-in combinations still apply.
    expect(isMetricsAlertActionEnabled({ language: 'PROMQL', dataset: prometheus })).toBe(true);
  });

  it('can widen the data sources an action accepts', () => {
    const query = {
      language: 'PPL',
      dataset: { type: 'INDEX_PATTERN', dataSource: { type: 'OtherEngine' } },
    };
    addExploreAlertSupport('logs', {
      datasetTypes: ['INDEX_PATTERN'],
      languages: ['PPL'],
      dataSourceTypes: ['OtherEngine'],
    });
    expect(isLogsAlertActionEnabled(query, true)).toBe(true);
  });
});
