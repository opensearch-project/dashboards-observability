/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount, shallow } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import {
  fieldCapQueryResponse1,
  fieldCapQueryResponse2,
  TEST_SERVICE_MAP,
  TEST_SERVICE_MAP_GRAPH,
} from '../../../../../../test/constants';
import {
  appendModeToTraceViewUri,
  calculateTicks,
  filtersToDsl,
  fixedIntervalToMilli,
  fixedIntervalToTickFormat,
  getAttributeFieldNames,
  getPercentileFilter,
  getServiceMapGraph,
  getServiceMapScaleColor,
  getTimestampPrecision,
  milliToNanoSec,
  minFixedInterval,
  MissingConfigurationMessage,
  nanoToMilliSec,
  NoMatchMessage,
  PanelTitle,
  processTimeStamp,
  renderBenchmark,
} from '../helper_functions';

describe('Trace analytics helper functions', () => {
  configure({ adapter: new Adapter() });

  it('renders panel title', () => {
    const title = shallow(<PanelTitle title="test" totalItems={10} />);
    const titleZeroCount = shallow(<PanelTitle title="test" />);
    expect(title).toMatchSnapshot();
    expect(titleZeroCount).toMatchSnapshot();
  });

  it('renders no match and missing configuration messages', () => {
    const noMatchMessage = shallow(<NoMatchMessage size="s" />);
    const missingConfigurationMessage = shallow(
      <MissingConfigurationMessage mode="data_prepper" />
    );
    expect(noMatchMessage).toMatchSnapshot();
    expect(missingConfigurationMessage).toMatchSnapshot();
  });

  it('renders benchmark', () => {
    // @ts-ignore
    const benchmarkPositive = mount(renderBenchmark(50));
    // @ts-ignore
    const benchmarkNegative = mount(renderBenchmark(-50));
    // @ts-ignore
    const benchmarkZero = mount(renderBenchmark(0));
    expect(benchmarkPositive).toMatchSnapshot();
    expect(benchmarkNegative).toMatchSnapshot();
    expect(benchmarkZero).toMatchSnapshot();
  });

  it('converts nanoseconds and milliseconds', () => {
    const ms = nanoToMilliSec(123456789);
    expect(ms).toEqual(123.456789);
    const ns = milliToNanoSec(123.456789);
    expect(ns).toEqual(123456789);
    // @ts-ignore
    const invalidMs = nanoToMilliSec('abc');
    expect(invalidMs).toEqual(0);
    // @ts-ignore
    const invalidNs = milliToNanoSec('abc');
    expect(invalidNs).toEqual(0);
  });

  it('returns service map scale color', () => {
    const color = getServiceMapScaleColor(0.5, 'latency');
    expect(color).toEqual('134, 105, 173');
  });

  it('returns service map graph', () => {
    const serviceMapGraph = getServiceMapGraph({
      map: TEST_SERVICE_MAP,
      idSelected: 'latency',
      ticks: [0, 50, 100, 150, 200, 250],
    });
    expect(serviceMapGraph).toEqual(TEST_SERVICE_MAP_GRAPH);
  });

  it('calculates ticks', () => {
    const ticks = calculateTicks(500, 200);
    const ticks2 = calculateTicks(0, 200, 10);
    expect(ticks).toEqual([0, 50, 100, 150, 200]);
    expect(ticks2).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200]);
  });

  it('calculates fixed_interval for date_histograms', () => {
    const fixedInterval = minFixedInterval('now-5y', 'now');
    expect(fixedInterval).toEqual('365d');
    const ms = fixedIntervalToMilli('1h');
    expect(ms).toEqual(3600000);
    const tickFormat = fixedIntervalToTickFormat('1h');
    expect(tickFormat).toEqual('');
  });

  it('returns percentile filter DSL', () => {
    const DSL = getPercentileFilter(
      [{ traceGroupName: 'order', durationFilter: { gte: 1000 } }],
      '>= 95th'
    );
    expect(DSL).toEqual(
      JSON.parse(
        `{"field":"Latency percentile within trace group","operator":"","value":">= 95th","inverted":false,"disabled":false,"custom":{"query":{"bool":{"must":[],"filter":[],"should":[{"bool":{"must":[{"term":{"traceGroup":{"value":"order"}}},{"range":{"traceGroupFields.durationInNanos":{"gte":1000}}}]}}],"must_not":[],"minimum_should_match":1}}}}`
      )
    );
  });

  it('converts filters to DSL', () => {
    const getTestDslFromFilters = (field = 'traceGroup', operator = 'exists') =>
      filtersToDsl(
        'data_prepper',
        [
          {
            field,
            operator,
            value: { from: '100', to: '\u221E' },
            inverted: false,
            disabled: false,
          },
        ],
        'order',
        'now-5m',
        'now'
      );
    const existsDSL = getTestDslFromFilters();
    expect(JSON.stringify(existsDSL)).toEqual(
      '{"query":{"bool":{"must":[{"exists":{"field":"traceGroup"}}],"filter":[{"range":{"startTime":{"gte":"now-5m","lte":"now"}}},{"query_string":{"query":"order"}}],"should":[],"must_not":[]}},"custom":{"timeFilter":[{"range":{"startTime":{"gte":"now-5m","lte":"now"}}}],"serviceNames":[],"serviceNamesExclude":[],"traceGroup":[],"traceGroupExclude":[],"percentiles":{"query":{"bool":{"should":[]}}}}}'
    );

    const isDSL = getTestDslFromFilters('traceGroup', 'is');
    expect(JSON.stringify(isDSL)).toEqual(
      '{"query":{"bool":{"must":[{"term":{"traceGroup":{"from":"100","to":"∞"}}}],"filter":[{"range":{"startTime":{"gte":"now-5m","lte":"now"}}},{"query_string":{"query":"order"}}],"should":[],"must_not":[]}},"custom":{"timeFilter":[{"range":{"startTime":{"gte":"now-5m","lte":"now"}}}],"serviceNames":[],"serviceNamesExclude":[],"traceGroup":[],"traceGroupExclude":[],"percentiles":{"query":{"bool":{"should":[]}}}}}'
    );
    const isBetweenDSL = getTestDslFromFilters('durationInNanos', 'is between');
    expect(JSON.stringify(isBetweenDSL)).toEqual(
      '{"query":{"bool":{"must":[{"range":{"durationInNanos":{"gte":"100"}}}],"filter":[{"range":{"startTime":{"gte":"now-5m","lte":"now"}}},{"query_string":{"query":"order"}}],"should":[],"must_not":[]}},"custom":{"timeFilter":[{"range":{"startTime":{"gte":"now-5m","lte":"now"}}}],"serviceNames":[],"serviceNamesExclude":[],"traceGroup":[],"traceGroupExclude":[],"percentiles":{"query":{"bool":{"should":[]}}}}}'
    );

    const customDSL = filtersToDsl(
      'data_prepper',
      [
        {
          field: 'serviceName',
          operator: 'is',
          value: 'order',
          inverted: false,
          disabled: false,
          custom: { query: { bool: { should: ['test'], minimum_should_match: 1 } } },
        },
      ],
      'order',
      'now-5m',
      'now'
    );
    expect(JSON.stringify(customDSL)).toEqual(
      '{"query":{"bool":{"must":[],"filter":[{"range":{"startTime":{"gte":"now-5m","lte":"now"}}},{"query_string":{"query":"order"}}],"should":["test"],"must_not":[],"minimum_should_match":1}},"custom":{"timeFilter":[{"range":{"startTime":{"gte":"now-5m","lte":"now"}}}],"serviceNames":[],"serviceNamesExclude":[],"traceGroup":[],"traceGroupExclude":[],"percentiles":{"query":{"bool":{"should":["test"],"minimum_should_match":1}}}}}'
    );
  });

  describe('getAttributeFieldNames', () => {
    it("should return only field names starting with 'resource.attributes' or 'span.attributes' or 'attributes'", () => {
      const expectedFields = [
        'span.attributes.http@url',
        'span.attributes.net@peer@ip',
        'span.attributes.http@user_agent.keyword',
        'resource.attributes.telemetry@sdk@version.keyword',
        'resource.attributes.host@hostname.keyword',
        'attributes.url',
        'attributes.custom_field.keyword',
      ];
      const result = getAttributeFieldNames(fieldCapQueryResponse1);
      expect(result).toEqual(expectedFields);
    });

    it('should return an empty array if no fields match the specified prefixes', () => {
      const result = getAttributeFieldNames(fieldCapQueryResponse2);
      expect(result).toEqual([]);
    });
  });

  describe('getTimestampPrecision', () => {
    it('returns "millis" for 13-digit timestamps', () => {
      expect(getTimestampPrecision(1703599200000)).toEqual('millis');
    });

    it('returns "micros" for 16-digit timestamps', () => {
      expect(getTimestampPrecision(1703599200000000)).toEqual('micros');
    });

    it('returns "nanos" for 19-digit timestamps', () => {
      expect(getTimestampPrecision(1703599200000000000)).toEqual('nanos');
    });

    it('returns "millis" for invalid or missing timestamps', () => {
      expect(getTimestampPrecision((undefined as unknown) as number)).toEqual('millis');
      expect(getTimestampPrecision(123)).toEqual('millis');
    });
  });

  describe('appendModeToTraceViewUri', () => {
    const mockGetTraceViewUri = (traceId: string) => `#/traces/${traceId}`;

    it('appends mode to the URI when mode is provided', () => {
      const result = appendModeToTraceViewUri('123', mockGetTraceViewUri, 'data_prepper');
      expect(result).toEqual('#/traces/123?mode=data_prepper');
    });

    it('appends mode correctly for hash router URIs with existing query params', () => {
      const result = appendModeToTraceViewUri('123', (id) => `#/traces/${id}?foo=bar`, 'jaeger');
      expect(result).toEqual('#/traces/123?foo=bar&mode=jaeger');
    });

    it('does not append mode if not provided', () => {
      const result = appendModeToTraceViewUri('123', mockGetTraceViewUri, null);
      expect(result).toEqual('#/traces/123');
    });

    it('handles URIs without a hash router', () => {
      const result = appendModeToTraceViewUri('123', (id) => `/traces/${id}`, 'data_prepper');
      expect(result).toEqual('/traces/123?mode=data_prepper');
    });

    it('handles URIs without a hash router and existing query params', () => {
      const result = appendModeToTraceViewUri('123', (id) => `/traces/${id}?foo=bar`, 'jaeger');
      expect(result).toEqual('/traces/123?foo=bar&mode=jaeger');
    });
  });

  describe('processTimeStamp', () => {
    it('returns microseconds for jaeger mode (start time)', () => {
      const time = '2024-01-01T00:00:00Z';
      const expected = Math.floor(new Date(time).getTime() / 1000) * 1000000;
      expect(processTimeStamp(time, 'jaeger', false)).toEqual(expected);
    });

    it('returns microseconds for jaeger mode (end time)', () => {
      const time = '2024-01-01T00:00:00Z';
      const expected = Math.floor(new Date(time).getTime() / 1000) * 1000000;
      expect(processTimeStamp(time, 'jaeger', true)).toEqual(expected);
    });

    it('returns input time for non-jaeger mode', () => {
      const time = 'now-5m';
      expect(processTimeStamp(time, 'data_prepper')).toBe(time);
    });

    it('returns different values for start and end time for now/y, now/M, now/d, now/w in jaeger mode', () => {
      const formats = ['now/y', 'now/M', 'now/d', 'now/w'];
      formats.forEach((format) => {
        const start = processTimeStamp(format, 'jaeger', false);
        const end = processTimeStamp(format, 'jaeger', true);
        expect(end).not.toEqual(start);
      });
    });
  });
});
