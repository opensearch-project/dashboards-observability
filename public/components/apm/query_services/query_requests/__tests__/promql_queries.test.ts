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
