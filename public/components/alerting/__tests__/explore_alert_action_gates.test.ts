/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isLogsAlertActionEnabled,
  isMetricsAlertActionEnabled,
} from '../explore_alert_action_gates';

const indexPattern = { type: 'INDEX_PATTERN', dataSource: { type: 'OpenSearch' } };
const prometheus = { type: 'PROMETHEUS' };
const aoss = { type: 'INDEX_PATTERN', dataSource: { type: 'OpenSearch Serverless' } };

describe('isLogsAlertActionEnabled', () => {
  it.each(['PPL', 'SQL', 'ppl'])('offers the rule for %s on an index pattern', (language) => {
    expect(isLogsAlertActionEnabled({ language, dataset: indexPattern }, true)).toBe(true);
  });

  it('stays hidden without PPL alerting', () => {
    expect(isLogsAlertActionEnabled({ language: 'PPL', dataset: indexPattern }, false)).toBe(false);
  });

  it('stays hidden on the Metrics page', () => {
    expect(isLogsAlertActionEnabled({ language: 'PROMQL', dataset: prometheus }, true)).toBe(false);
  });

  it("stays hidden for another source's own language, which the flyout can't use", () => {
    expect(
      isLogsAlertActionEnabled({ language: 'OtherQL', dataset: { type: 'OTHER_LOGS' } }, true)
    ).toBe(false);
  });

  it('stays hidden on AOSS collections and without a query', () => {
    expect(isLogsAlertActionEnabled({ language: 'PPL', dataset: aoss }, true)).toBe(false);
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

  it('stays hidden for other languages, on AOSS, and without a query', () => {
    expect(isMetricsAlertActionEnabled({ language: 'PPL', dataset: prometheus })).toBe(false);
    expect(
      isMetricsAlertActionEnabled({
        language: 'PROMQL',
        dataset: { type: 'PROMETHEUS', dataSource: { type: 'OpenSearch Serverless' } },
      })
    ).toBe(false);
    expect(isMetricsAlertActionEnabled(undefined)).toBe(false);
  });
});
