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
          startTime: 1000,
          duration: 2000,
          tag: { error: false },
          process: { serviceName: 'serviceX' },
        },
      },
      {
        _source: {
          traceID: 'abc',
          operationName: 'opB',
          startTime: 1500,
          duration: 3000,
          tag: { error: true },
          process: { serviceName: 'serviceY' },
        },
      },
    ],
  },
};

describe('overviewAndPieHelpers', () => {
  describe('normalizePayload', () => {
    it('should return the same array if the input is already an array', () => {
      const arr = [1, 2, 3];
      expect(normalizePayload(arr)).toEqual(arr);
    });
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
      const overview = getOverviewFields(jaegerPayload.hits.hits, 'jaeger');
      expect(overview).toBeTruthy();
      expect(overview?.trace_id).toBe('abc');
      expect(overview?.trace_group).toBe('opA');
      // For jaeger we use startTime = 1000, duration = 2000 → lastUpdated = 1000 + (2000/1000) = 1002 ms
      const expectedLastUpdated = moment(1002).format('MM/DD/YYYY HH:mm:ss');
      expect(overview?.last_updated).toBe(expectedLastUpdated);
      expect(overview?.latency).toBe('2.00 ms');
      expect(overview?.error_count).toBe(0);
    });

    it('should return correct overview fields for data prepper mode', () => {
      const overview = getOverviewFields(dataPrepperPayload.hits.hits, 'data_prepper');
      expect(overview).toBeTruthy();
      expect(overview?.trace_id).toBe('def');
      expect(overview?.trace_group).toBe('TestGroup');
      // For data prepper, we use traceGroupFields.endTime for last_updated.
      const expectedLastUpdated = moment('2023-02-05T12:00:00Z').format('MM/DD/YYYY HH:mm:ss');
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
