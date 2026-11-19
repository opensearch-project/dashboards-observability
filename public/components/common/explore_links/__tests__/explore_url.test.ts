/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import rison from 'rison-node';
import {
  buildExploreNavigation,
  encodeTimeRangeValueForG,
  isExploreQueryTarget,
} from '../explore_url';
import type { ExploreQueryTarget } from '../../../../../common/types/explore_links';

/** Decode one `_x=` param of a hash path the way OSD reads it: URL-decode, then rison. */
function param(path: string, key: string): any {
  const query = path.slice(path.indexOf('?') + 1);
  const raw = query
    .split('&')
    .find((p) => p.startsWith(`${key}=`))!
    .slice(key.length + 1);
  return rison.decode(decodeURIComponent(raw));
}

const metricsTarget: ExploreQueryTarget = {
  signal: 'metrics',
  dataset: { id: 'my-prom', title: 'my-prom', type: 'PROMETHEUS', timeFieldName: 'Time' },
  language: 'PROMQL',
  query: 'sum by (svc) (rate(http_requests_total{code!="200"}[5m]))',
};

describe('buildExploreNavigation', () => {
  it('opens Explore Metrics in the query view with the dataset, query and time', () => {
    const { appId, path } = buildExploreNavigation(metricsTarget, { from: 'now-1h', to: 'now' });
    expect(appId).toBe('explore/metrics');
    expect(path.startsWith('#/?')).toBe(true);
    expect(param(path, '_g').time).toEqual({ from: 'now-1h', to: 'now' });
    expect(param(path, '_q')).toEqual({
      dataset: {
        id: 'my-prom',
        title: 'my-prom',
        type: 'PROMETHEUS',
        language: 'PROMQL',
        timeFieldName: 'Time',
        signalType: 'metrics',
      },
      language: 'PROMQL',
      query: metricsTarget.query,
    });
    expect(param(path, '_a')).toEqual({
      ui: { activeTabId: 'explore_visualization_tab', metricsPageMode: 'query' },
    });
  });

  it('opens Discover Logs with the dataSource and no signalType', () => {
    const target: ExploreQueryTarget = {
      signal: 'logs',
      dataset: {
        id: 'mds-1::logs-*',
        title: 'logs-*',
        type: 'INDEXES',
        timeFieldName: '@timestamp',
        dataSource: { id: 'mds-1', title: 'prod', type: 'OpenSearch' },
      },
      language: 'PPL',
      query: "| where status >= 500 and msg = 'it''s'",
    };
    const { appId, path } = buildExploreNavigation(target, {
      from: '2026-11-18T10:00:00.000Z',
      to: 'now',
    });
    expect(appId).toBe('explore/logs');
    const q = param(path, '_q');
    expect(q.dataset).toEqual({
      id: 'mds-1::logs-*',
      title: 'logs-*',
      type: 'INDEXES',
      language: 'PPL',
      timeFieldName: '@timestamp',
      dataSource: { id: 'mds-1', title: 'prod', type: 'OpenSearch' },
    });
    expect(q.query).toBe(target.query);
    expect(param(path, '_g').time.from).toBe('2026-11-18T10:00:00.000Z');
    expect(param(path, '_a')).toEqual({ ui: { activeTabId: 'logs' } });
  });

  it('survives rison and URL special characters in every value', () => {
    const tricky = "a!b'c (d) & e # f % g + h / i : j ? k";
    const { path } = buildExploreNavigation(
      {
        signal: 'metrics',
        dataset: { id: tricky, type: 'PROMETHEUS' },
        language: 'PROMQL',
        query: `x{l="${tricky}"}`,
      },
      { from: 'now-7d', to: 'now+1h' }
    );
    // One `#` (the hash) and no raw `&` inside values: the three params split cleanly.
    expect(path.split('#').length).toBe(2);
    expect(
      path
        .slice(3)
        .split('&')
        .map((p) => p.split('=')[0])
    ).toEqual(['_g', '_q', '_a']);
    const q = param(path, '_q');
    expect(q.dataset.id).toBe(tricky);
    expect(q.dataset.title).toBe(tricky);
    expect(q.query).toBe(`x{l="${tricky}"}`);
    expect(param(path, '_g').time).toEqual({ from: 'now-7d', to: 'now+1h' });
  });

  it('keeps line breaks in a multi-line query', () => {
    const query = 'sum(\n  rate(x[5m]) # per second\n)';
    const { path } = buildExploreNavigation(
      { ...metricsTarget, query },
      { from: 'now-1h', to: 'now' }
    );
    expect(param(path, '_q').query).toBe(query);
  });

  it('writes the data source meta (the APM Prometheus link shape)', () => {
    const { path } = buildExploreNavigation(
      { ...metricsTarget, dataset: { ...metricsTarget.dataset, dataSource: { meta: {} } } },
      { from: 'now-1h', to: 'now' }
    );
    expect(param(path, '_q').dataset.dataSource).toEqual({ meta: {} });
    expect(path).toContain('dataSource:(meta:())');
  });
});

describe('encodeTimeRangeValueForG', () => {
  it('keeps relative values bare and quotes ISO timestamps', () => {
    expect(encodeTimeRangeValueForG('now-1h')).toBe('now-1h');
    expect(decodeURIComponent(encodeTimeRangeValueForG('2026-11-18T10:00:00.000Z'))).toBe(
      "'2026-11-18T10:00:00.000Z'"
    );
  });
});

describe('isExploreQueryTarget', () => {
  it('accepts a complete target and rejects incomplete or unknown ones', () => {
    expect(isExploreQueryTarget(metricsTarget)).toBe(true);
    expect(isExploreQueryTarget({ ...metricsTarget, signal: 'dashboards' })).toBe(false);
    expect(isExploreQueryTarget({ ...metricsTarget, dataset: { id: '', type: 'X' } })).toBe(false);
    expect(isExploreQueryTarget({ ...metricsTarget, language: '' })).toBe(false);
    expect(isExploreQueryTarget(undefined)).toBe(false);
  });
});
