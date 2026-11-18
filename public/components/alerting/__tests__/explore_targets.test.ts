/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  alertExploreTargets,
  alertExploreTimeRange,
  pickTimeField,
  pplMonitorTargets,
  prometheusRuleTargets,
  ruleExploreTargets,
  splitPplSource,
  withRuleExploreTargets,
} from '../explore_targets';
import type {
  Datasource,
  UnifiedAlertSummary,
  UnifiedRuleSummary,
} from '../../../../common/types/alerting';
import type { ExploreQueryTarget } from '../../../../common/types/explore_links';

const promDs: Datasource = {
  id: 'ds-1',
  name: 'Prom display name',
  type: 'prometheus',
  url: '',
  enabled: true,
  directQueryName: 'my_prom',
};
const osDs: Datasource = {
  id: 'ds-2',
  name: 'prod-cluster',
  type: 'opensearch',
  url: '',
  enabled: true,
  mdsId: 'mds-9',
};
const localDs: Datasource = {
  id: 'ds-3',
  name: 'local',
  type: 'opensearch',
  url: '',
  enabled: true,
};

const rule = (over: Partial<UnifiedRuleSummary>): UnifiedRuleSummary => ({
  id: 'r-1',
  datasourceId: 'ds-1',
  datasourceType: 'prometheus',
  definitionType: 'prometheus_rule',
  name: 'HighErrors',
  enabled: true,
  severity: 'high',
  query: 'rate(errors_total[5m]) > 0.1',
  condition: '',
  labels: {},
  annotations: {},
  monitorType: 'metric',
  status: 'active',
  healthStatus: 'healthy',
  createdBy: '',
  notificationDestinations: [],
  evaluationInterval: '1m',
  pendingPeriod: '0s',
  ...over,
});

describe('prometheusRuleTargets', () => {
  it('opens the rule signal (no threshold) on the connection', () => {
    expect(prometheusRuleTargets(rule({}), promDs)).toEqual([
      {
        signal: 'metrics',
        dataset: {
          id: 'my_prom',
          title: 'my_prom',
          type: 'PROMETHEUS',
          timeFieldName: 'Time',
          dataSource: { meta: {} },
        },
        language: 'PROMQL',
        query: 'rate(errors_total[5m])',
      },
    ]);
  });
  it('gives one labelled target per side of a multi-window rule', () => {
    const targets = prometheusRuleTargets(
      rule({
        query:
          'slo:err:ratio_rate_5m{slo_id="s"} > 14.4 and slo:err:ratio_rate_1h{slo_id="s"} > 14.4',
      }),
      promDs
    );
    expect(targets.map((t) => [t.label, t.query])).toEqual([
      ['slo:err:ratio_rate_5m', 'slo:err:ratio_rate_5m{slo_id="s"}'],
      ['slo:err:ratio_rate_1h', 'slo:err:ratio_rate_1h{slo_id="s"}'],
    ]);
  });
  it('falls back to the datasource name without a direct-query name', () => {
    const [t] = prometheusRuleTargets(rule({}), { ...promDs, directQueryName: undefined });
    expect(t.dataset.id).toBe('Prom display name');
  });
});

describe('PPL monitors', () => {
  it('splits the source index from the pipeline', () => {
    expect(splitPplSource('source = logs-* | where status >= 500')).toEqual({
      index: 'logs-*',
      rest: '| where status >= 500',
    });
    expect(splitPplSource('source=`my-index`')).toEqual({ index: 'my-index', rest: '' });
    expect(splitPplSource('search source=a')).toBeUndefined();
    expect(splitPplSource('source=a,b | head')).toBeUndefined();
  });
  it('opens the PPL on the monitor index through its data source', () => {
    const ppl = rule({
      datasourceId: 'ds-2',
      datasourceType: 'opensearch',
      definitionType: 'monitor',
      monitorType: 'ppl',
      query: 'source=app-logs | where level = "ERROR"',
      labels: { query_language: 'ppl' },
    });
    expect(pplMonitorTargets(ppl, osDs)).toEqual([
      {
        signal: 'logs',
        dataset: {
          id: 'mds-9::app-logs',
          title: 'app-logs',
          type: 'INDEXES',
          dataSource: { id: 'mds-9', title: 'prod-cluster', type: 'OpenSearch' },
        },
        language: 'PPL',
        query: '| where level = "ERROR"',
      },
    ]);
    expect(pplMonitorTargets(ppl, localDs)[0].dataset).toEqual(
      expect.objectContaining({
        id: '::app-logs',
        dataSource: { id: '', title: 'Default Cluster', type: 'DATA_SOURCE' },
      })
    );
  });
  it('gives no target for SQL monitors', () => {
    expect(
      pplMonitorTargets(rule({ query: 'source=a', labels: { query_language: 'sql' } }), osDs)
    ).toEqual([]);
  });
});

describe('ruleExploreTargets / withRuleExploreTargets', () => {
  const own: ExploreQueryTarget = {
    signal: 'metrics',
    dataset: { id: 'x', type: 'SOME_TYPE' },
    language: 'L',
    query: 'q',
  };
  it('keeps targets the source set, derives Prometheus/PPL ones, and none for other kinds', () => {
    const datasources = [promDs, osDs];
    expect(ruleExploreTargets(rule({ exploreTargets: [own] }), datasources)).toEqual([own]);
    expect(ruleExploreTargets(rule({}), datasources)).toHaveLength(1);
    expect(
      ruleExploreTargets(
        rule({ datasourceId: 'ds-2', datasourceType: 'opensearch', monitorType: 'log' }),
        datasources
      )
    ).toEqual([]);
    expect(ruleExploreTargets(rule({ datasourceId: 'gone' }), datasources)).toEqual([]);
  });
  it('leaves rows with nothing to link unchanged (same object)', () => {
    const plain = rule({ datasourceId: 'gone' });
    const [out] = withRuleExploreTargets([plain], [promDs]);
    expect(out).toBe(plain);
  });
});

describe('alertExploreTargets', () => {
  const alert = (over: Partial<UnifiedAlertSummary>): UnifiedAlertSummary => ({
    id: 'a-1',
    datasourceId: 'ds-1',
    datasourceType: 'prometheus',
    name: 'HighErrors',
    state: 'active',
    severity: 'high',
    startTime: '2026-11-18T10:00:00.000Z',
    lastUpdated: '2026-11-18T10:05:00.000Z',
    labels: { alertname: 'HighErrors' },
    annotations: {},
    ...over,
  });
  const rules = [
    withRuleExploreTargets([rule({})], [promDs])[0],
    rule({ id: 'r-2', datasourceId: 'ds-other' }),
  ];
  it("uses the alert's own targets first", () => {
    const own = [{ signal: 'logs', dataset: { id: 'a', type: 'T' }, language: 'L', query: '' }];
    expect(alertExploreTargets(alert({ exploreTargets: own as any }), rules, [promDs])).toBe(own);
  });
  it('uses the Prometheus rule with the same alertname on the same datasource', () => {
    expect(alertExploreTargets(alert({}), rules, [promDs])[0].query).toBe('rate(errors_total[5m])');
    expect(alertExploreTargets(alert({ datasourceId: 'ds-x' }), rules, [promDs])).toEqual([]);
  });
  it('narrows same-named rules in several groups to those whose labels the alert carries', () => {
    const a = withRuleExploreTargets(
      [
        rule({ id: 'g1', group: 'g1', labels: { team: 'a' }, query: 'x_a > 1' }),
        rule({ id: 'g2', group: 'g2', labels: { team: 'b' }, query: 'x_b > 1' }),
      ],
      [promDs]
    );
    const out = alertExploreTargets(alert({ labels: { alertname: 'HighErrors', team: 'b' } }), a, [
      promDs,
    ]);
    expect(out.map((t) => t.query)).toEqual(['x_b']);
    // No rule's labels match: keep every same-named rule rather than none.
    expect(
      alertExploreTargets(alert({ labels: { alertname: 'HighErrors' } }), a, [promDs])
    ).toHaveLength(2);
  });

  it('uses the monitor of an OpenSearch alert', () => {
    const ppl = rule({
      id: 'mon-1',
      datasourceId: 'ds-2',
      datasourceType: 'opensearch',
      definitionType: 'monitor',
      monitorType: 'ppl',
      query: 'source=app | head',
    });
    const osAlert = alert({
      datasourceId: 'ds-2',
      datasourceType: 'opensearch',
      monitorId: 'mon-1',
    });
    expect(alertExploreTargets(osAlert, [ppl], [osDs])[0].dataset.id).toBe('mds-9::app');
  });
});

describe('alertExploreTimeRange', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');
  it('runs from 15 min before the start to now while the alert is open', () => {
    expect(
      alertExploreTimeRange(
        {
          startTime: '2026-11-18T10:00:00.000Z',
          lastUpdated: '2026-11-18T10:05:00.000Z',
          state: 'active',
        },
        now
      )
    ).toEqual({ from: '2026-11-18T09:45:00.000Z', to: 'now' });
  });
  it('ends 15 min after the last update once resolved', () => {
    expect(
      alertExploreTimeRange(
        {
          startTime: '2026-11-18T10:00:00.000Z',
          lastUpdated: '2026-11-18T10:05:00.000Z',
          state: 'resolved',
        },
        now
      )
    ).toEqual({ from: '2026-11-18T09:45:00.000Z', to: '2026-11-18T10:20:00.000Z' });
  });
  it('falls back to the last hour without a start time', () => {
    expect(
      alertExploreTimeRange({ startTime: 'bad', lastUpdated: '', state: 'active' }, now)
    ).toEqual({
      from: 'now-1h',
      to: 'now',
    });
  });
});

describe('pickTimeField', () => {
  it('prefers @timestamp, else the only date field, else none', () => {
    expect(pickTimeField(['created', '@timestamp'])).toBe('@timestamp');
    expect(pickTimeField(['created'])).toBe('created');
    expect(pickTimeField(['a', 'b'])).toBeUndefined();
    expect(pickTimeField([])).toBeUndefined();
  });
});
