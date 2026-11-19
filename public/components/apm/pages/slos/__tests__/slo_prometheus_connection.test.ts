/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Datasource } from '../../../../../../common/types/alerting';
import { resolveSloPrometheusConnection } from '../slo_prometheus_connection';

const prom = (id: string, name: string, directQueryName?: string): Datasource =>
  ({ id, name, type: 'prometheus', url: id, enabled: true, directQueryName }) as Datasource;

const DATASOURCES: Datasource[] = [
  { id: 'local-cluster', name: 'Local Cluster', type: 'opensearch', url: 'local', enabled: true },
  prom('so-prom-1', 'checkout_prom', 'checkout_prom'),
  prom('so-prom-2', 'other_prom', 'other_prom'),
  {
    id: 'so-logs',
    name: 'logs-cluster',
    type: 'opensearch',
    url: 'https://logs.example.com',
    enabled: true,
  },
];

describe('resolveSloPrometheusConnection', () => {
  it.each([
    ['its connection name', 'checkout_prom'],
    ['its saved-object id', 'so-prom-1'],
  ])("uses the SLO's own datasource when spec.datasourceId is %s", (_form, datasourceId) => {
    expect(resolveSloPrometheusConnection(datasourceId, DATASOURCES, 'other_prom')).toEqual({
      connectionId: 'checkout_prom',
      source: 'slo',
    });
  });

  it('matches the DirectQuery name when it differs from the display name', () => {
    const list = [prom('so-1', 'Checkout metrics', 'checkout_prom')];
    expect(resolveSloPrometheusConnection('checkout_prom', list, undefined)).toEqual({
      connectionId: 'checkout_prom',
      source: 'slo',
    });
  });

  it('falls back to the display name when the datasource has no DirectQuery name', () => {
    const list = [prom('so-1', 'prom-user-managed')];
    expect(resolveSloPrometheusConnection('so-1', list, undefined)).toEqual({
      connectionId: 'prom-user-managed',
      source: 'slo',
    });
  });

  it('prefers the SLO datasource over a different APM source', () => {
    expect(
      resolveSloPrometheusConnection('checkout_prom', DATASOURCES, 'other_prom').connectionId
    ).toBe('checkout_prom');
  });

  it('ignores datasources that are not Prometheus', () => {
    expect(resolveSloPrometheusConnection('logs-cluster', DATASOURCES, undefined)).toEqual({
      connectionId: '',
      source: 'none',
    });
  });

  it("falls back to the APM source when the SLO's datasource is not in the list", () => {
    expect(resolveSloPrometheusConnection('gone', DATASOURCES, 'apm-prom')).toEqual({
      connectionId: 'apm-prom',
      source: 'apm',
    });
  });

  it('falls back to the APM source when the SLO has no datasource id', () => {
    expect(resolveSloPrometheusConnection(undefined, DATASOURCES, 'apm-prom').source).toBe('apm');
    expect(resolveSloPrometheusConnection('  ', DATASOURCES, 'apm-prom').source).toBe('apm');
  });

  it('returns none when neither resolves', () => {
    expect(resolveSloPrometheusConnection('gone', [], undefined)).toEqual({
      connectionId: '',
      source: 'none',
    });
  });
});
