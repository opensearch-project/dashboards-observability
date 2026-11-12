/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { facetLabels } from '../facet_labels';
import { filterAlerts, matchesFilters, emptyFilters } from '../filter';

const cwLabels = { account: '444455556666', region: 'us-east-1', namespace: 'AWS/EC2' };

describe('facetLabels', () => {
  it('drops account and region from CloudWatch rows only', () => {
    expect(facetLabels({ datasourceType: 'cloudwatch', labels: cwLabels })).toEqual({
      namespace: 'AWS/EC2',
    });
    const prom = { region: 'eu', account: 'x', team: 'a' };
    expect(facetLabels({ datasourceType: 'prometheus', labels: prom })).toBe(prom);
  });
});

describe('label facet matching ignores CloudWatch account and region', () => {
  const cw = {
    datasourceType: 'cloudwatch',
    labels: cwLabels,
    severity: 'high',
    state: 'active',
    name: 'cw',
  };
  const prom = {
    datasourceType: 'prometheus',
    labels: { region: 'us-east-1' },
    severity: 'high',
    state: 'active',
    name: 'prom',
  };

  it('filterAlerts matches a region label on Prometheus rows, not CloudWatch rows', () => {
    const out = filterAlerts([cw, prom], { labels: { region: ['us-east-1'] } });
    expect(out.map((a) => a.name)).toEqual(['prom']);
    // Other CloudWatch labels still filter.
    expect(
      filterAlerts([cw, prom], { labels: { namespace: ['AWS/EC2'] } }).map((a) => a.name)
    ).toEqual(['cw']);
  });

  it('matchesFilters does the same for rules', () => {
    const rule = {
      status: 'active',
      severity: 'high',
      monitorType: 'metric',
      healthStatus: 'healthy',
      createdBy: '',
      notificationDestinations: [],
    };
    const filters = { ...emptyFilters(), labels: { region: ['us-east-1'] } };
    expect(matchesFilters({ ...rule, ...cw }, filters)).toBe(false);
    expect(matchesFilters({ ...rule, ...prom }, filters)).toBe(true);
  });
});
