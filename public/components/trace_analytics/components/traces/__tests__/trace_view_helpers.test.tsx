/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import moment from 'moment';
import { getOverviewFields, getServiceBreakdownData } from '../trace_view_helpers';
import { normalizePayload } from '../../../requests/traces_request_handler';

const dataPrepperPayload = {
  hits: {
    hits: [
      {
        _source: {
          traceId: 'def',
          traceGroup: 'TestGroup',
          traceGroupFields: {
            endTime: '2023-02-05T12:00:00Z',
            durationInNanos: 5000000,
            statusCode: 0,
          },
          serviceName: 'serviceA',
          startTime: '2023-02-05T11:59:59Z',
        },
      },
      {
        _source: {
          traceId: 'def',
          traceGroup: 'TestGroup',
          traceGroupFields: {
            endTime: '2023-02-05T12:00:10Z',
            durationInNanos: 10000000,
            statusCode: 0,
          },
          serviceName: 'serviceB',
          startTime: '2023-02-05T11:59:50Z',
        },
      },
    ],
  },
};

const jaegerPayload = {
  hits: {
    hits: [
      {
        _source: {
          traceID: 'abc',
          operationName: 'opA',
          startTime: 1000000,
          duration: 2000000,
          tag: { error: false },
          process: { serviceName: 'serviceX' },
        },
      },
      {
        _source: {
          traceID: 'abc',
          operationName: 'opB',
          startTime: 1500000,
          duration: 3000000,
          tag: { error: true },
          process: { serviceName: 'serviceY' },
        },
      },
    ],
  },
};

describe('overviewAndPieHelpers', () => {
  describe('normalizePayload', () => {
    it('should return hits.hits if payload is an object with that structure', () => {
      const obj = { hits: { hits: [4, 5, 6] } };
      expect(normalizePayload(obj)).toEqual([4, 5, 6]);
    });
    it('should return an empty array for unexpected input', () => {
      const obj = { foo: 'bar' };
      expect(normalizePayload(obj)).toEqual([]);
    });
  });

  describe('getOverviewFields', () => {
    it('should return correct overview fields for jaeger mode', () => {
      // Sorting as handlePayloadRequest does in descending order
      const sortedJaegerPayload = jaegerPayload.hits.hits.sort(
        (a, b) => b._source.startTime - a._source.startTime
      );
      const overview = getOverviewFields(sortedJaegerPayload, 'jaeger');
      expect(overview).toBeTruthy();
      expect(overview?.trace_id).toBe('abc');
      expect(overview?.trace_group).toBe('opA');
      const startTimeMillis = 1000000 / 1000;
      const durationMillis = 2000000 / 1000;
      const lastUpdated = startTimeMillis + durationMillis;
      const expectedLastUpdated = moment(lastUpdated).format('MM/DD/YYYY HH:mm:ss.SSS');
      const latencyInMilliseconds = durationMillis.toFixed(2);
      expect(overview?.last_updated).toBe(expectedLastUpdated);
      expect(overview?.latency).toBe(`${latencyInMilliseconds} ms`);
      expect(overview?.error_count).toBe(1);
    });

    it('should return correct overview fields for data prepper mode', () => {
      // Sorting as handlePayloadRequest does in descending order
      const sortedDataPrepperPayload = dataPrepperPayload.hits.hits.sort(
        (a, b) =>
          new Date(b._source.traceGroupFields.endTime).getTime() -
          new Date(a._source.traceGroupFields.endTime).getTime()
      );
      const overview = getOverviewFields(sortedDataPrepperPayload, 'data_prepper');
      expect(overview).toBeTruthy();
      expect(overview?.trace_id).toBe('def');
      expect(overview?.trace_group).toBe('TestGroup');
      const expectedLastUpdated = moment('2023-02-05T12:00:00Z').format('MM/DD/YYYY HH:mm:ss.SSS');
      expect(overview?.last_updated).toBe(expectedLastUpdated);
      expect(overview?.latency).toBe('5.00 ms');
      expect(overview?.error_count).toBe(0);
    });
  });

  describe('getServiceBreakdownData', () => {
    it('should return correct service breakdown data for data prepper mode', () => {
      const { serviceBreakdownData, colorMap } = getServiceBreakdownData(
        dataPrepperPayload.hits.hits, // Pass hits.hits directly
        'data_prepper'
      );
      expect(serviceBreakdownData).toBeDefined();
      expect(Array.isArray(serviceBreakdownData)).toBe(true);
      expect(colorMap).toBeDefined();
      const labels = serviceBreakdownData[0].labels;
      expect(labels).toContain('serviceA');
      expect(labels).toContain('serviceB');
    });

    it('should return correct service breakdown data for jaeger mode', () => {
      const { serviceBreakdownData, colorMap } = getServiceBreakdownData(
        jaegerPayload.hits.hits,
        'jaeger'
      );
      expect(serviceBreakdownData).toBeDefined();
      expect(Array.isArray(serviceBreakdownData)).toBe(true);
      expect(colorMap).toBeDefined();
      const labels = serviceBreakdownData[0].labels;
      expect(labels).toContain('serviceX');
      expect(labels).toContain('serviceY');
    });
  });
});
