/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getQueryServiceMapThroughput,
  getQueryServiceMapFaults,
  getQueryServiceMapErrors,
  getQueryServicesThroughput,
  getQueryServicesThroughputTotal,
  getQueryServicesFailureRatio,
  getQueryDependencyRequests,
  getQueryDependencyLatency,
  getQueryDependencyFaultRateCard,
  getQueryDependencyCallers,
  getQueryServiceMapDependencyThroughput,
  getQueryServiceMapDependencyFailureRatioTotal,
  getQueryServiceMapDependencyLatencyInstant,
  getQueryServiceMapDependencyThroughputRange,
  getQueryServiceMapDependencyFailureRatioRange,
  getQueryServiceMapDependencyLatencyRange,
  getQueryEdgeRequests,
  getQueryEdgeLatencyP99,
  DEPENDENCY_CALLS_FILTER,
} from '../promql_queries';

// Regression guard: when the service filter is empty (the default now that the
// catalog and topology rely on `sum by (...)` grouping instead of a service=~
// list), the builders must not emit a leading comma such as `request{,...}`,
// which Prometheus rejects as a parse error.
describe('promql_queries selectors', () => {
  const mapBuilders = {
    getQueryServiceMapThroughput,
    getQueryServiceMapFaults,
    getQueryServiceMapErrors,
  };

  describe('service map node metrics', () => {
    Object.entries(mapBuilders).forEach(([name, build]) => {
      it(`${name} produces a valid selector with an empty filter`, () => {
        const q = build('', '3600s');
        expect(q).not.toContain('{,');
        expect(q).not.toContain('{ ,');
        expect(q).toContain('remoteService=""');
        expect(q).toContain('namespace="span_derived"');
      });

      it(`${name} includes the filter when provided`, () => {
        const q = build('service=~"a|b"', '3600s');
        expect(q).not.toContain('{,');
        expect(q).toContain('service=~"a|b"');
        expect(q).toContain('remoteService=""');
      });
    });
  });

  describe('services home node metrics', () => {
    const servicesBuilders: Array<[string, string]> = [
      ['getQueryServicesThroughput', getQueryServicesThroughput('')],
      ['getQueryServicesThroughputTotal', getQueryServicesThroughputTotal('', '15m')],
      ['getQueryServicesFailureRatio', getQueryServicesFailureRatio('')],
    ];

    servicesBuilders.forEach(([name, q]) => {
      it(`${name} produces no leading comma with an empty filter`, () => {
        expect(q).not.toContain('{,');
        expect(q).not.toContain('{ ,');
      });
    });
  });
});

// data-prepper tags messaging series with spanKind="PRODUCER"|"CONSUMER". Dependency views keep
// the calls INTO a dependency (spanKind!="CONSUMER"), so a broker counts each message once; the
// filter still matches database / external series and series without the label (older data).
describe('dependency queries and the spanKind label', () => {
  it('uses a negative filter so series without spanKind still match', () => {
    expect(DEPENDENCY_CALLS_FILTER).toBe('spanKind!="CONSUMER"');
  });

  it('dependency node metrics exclude consumer series', () => {
    [
      getQueryDependencyRequests('generic:default', 'kafka:orders', '1m'),
      getQueryDependencyLatency('generic:default', 'kafka:orders'),
      getQueryDependencyFaultRateCard('generic:default', 'kafka:orders'),
      getQueryServiceMapDependencyThroughput('15m'),
      getQueryServiceMapDependencyFailureRatioTotal('15m'),
      getQueryServiceMapDependencyLatencyInstant(0.99, '15m'),
      getQueryServiceMapDependencyThroughputRange(),
      getQueryServiceMapDependencyFailureRatioRange(),
      getQueryServiceMapDependencyLatencyRange(0.99),
    ].forEach((q) => {
      expect(q).toContain('spanKind!="CONSUMER"');
      expect(q).not.toContain('spanKind="PRODUCER"');
    });
  });

  it('every request/error/fault/latency selector in the map builders carries the filter', () => {
    const q = getQueryServiceMapDependencyFailureRatioTotal('15m');
    const selectors = q.match(/\{remoteService!=""[^}]*\}/g) || [];
    expect(selectors.length).toBe(3);
    selectors.forEach((sel) => expect(sel).toContain('spanKind!="CONSUMER"'));
  });

  it('callers keep both directions and group by spanKind', () => {
    const q = getQueryDependencyCallers('generic:default', 'kafka:orders', '15m');
    expect(q).toContain('sum by (service, remoteOperation, spanKind)');
    expect(q).not.toContain('spanKind!=');
  });

  it('edge queries only add a direction filter for broker -> consumer edges', () => {
    expect(getQueryEdgeRequests('checkout', 'prod', 'cart', '15m')).not.toContain('spanKind');
    const consumer = getQueryEdgeRequests('shipping', 'prod', 'kafka:orders', '15m', {
      consumerEdge: true,
    });
    expect(consumer).toContain('service="shipping"');
    expect(consumer).toContain('remoteService="kafka:orders"');
    expect(consumer).toContain('spanKind!="PRODUCER"');
    expect(
      getQueryEdgeLatencyP99('shipping', 'prod', 'kafka:orders', '15m', { consumerEdge: true })
    ).toContain('spanKind!="PRODUCER"');
  });

  it('excludes consumer series on a producer -> broker edge', () => {
    const producer = getQueryEdgeRequests('checkout', 'prod', 'kafka:orders', '15m', {
      producerEdge: true,
    });
    expect(producer).toContain('service="checkout"');
    expect(producer).toContain('spanKind!="CONSUMER"');
    expect(producer).not.toContain('spanKind!="PRODUCER"');
  });
});
