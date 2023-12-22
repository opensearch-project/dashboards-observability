/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  convertDateTime,
  findMinInterval,
  parsePromQLIntoKeywords,
  preprocessMetricQuery,
  updateCatalogVisualizationQuery,
} from '../';

describe('Query Utils', () => {
  describe('parsePromQLIntoKeywords', () => {
    test('should parse plain catalog.metric into keywords', () => {
      const query = 'catalog.metric';
      const keywords = parsePromQLIntoKeywords(query);
      expect(keywords).toEqual({
        aggregation: 'avg',
        attributesGroupBy: '',
        connection: 'catalog',
        metric: 'metric',
      });
    });

    test('should parse simple ppl query_range into keywords', () => {
      const query = "source = test_catalog.query_range('metric')";
      const keywords = parsePromQLIntoKeywords(query);
      expect(keywords).toEqual({
        aggregation: 'avg',
        attributesGroupBy: '',
        connection: 'test_catalog',
        metric: 'metric',
      });
    });

    test('should parse promql into keywords', () => {
      const query = "source = test_catalog.query_range('count by(one,two) (metric)')";
      const keywords = parsePromQLIntoKeywords(query);
      expect(keywords).toEqual({
        aggregation: 'count',
        attributesGroupBy: 'one,two',
        connection: 'test_catalog',
        metric: 'metric',
      });
    });
  });
  describe('findMinInterval by moment strings', () => {
    it.each([
      ['now-3y', 'y'],
      ['now-23M', 'w'],
      ['now-4M', 'w'],
      ['now-3w', 'd'],
      ['now-40h', 'h'], // less than 2 days
      ['now-119m', 'm'],
      ['now-59s', 's'],
      ['now-900ms', 'ms'],
    ])("when input is '{0}' expect span '{3}'", (start, span) => {
      const minInterval = findMinInterval(start, 'now');
      expect(minInterval).toEqual(span);
    });
  });
  describe('convertDateTime', () => {
    it('converts from absolute timestamp', () => {
      const time = '2020-07-21T18:37:44.710Z';
      const converted = convertDateTime(time);
      expect(converted).toEqual('2020-07-21 18:37:44.710000');
    });
    it('formats to PPL standard format when default formatting', () => {
      const time = '2020-07-21T18:37:44.710Z';
      const converted = convertDateTime(time, true, true);
      expect(converted).toEqual('2020-07-21 18:37:44.710000');
    });
    it('formats to specified format when provided', () => {
      const time = '2020-07-21T18:37:44.710Z';
      const converted = convertDateTime(time, true, 'YYYY-MMM-DD');
      expect(converted).toMatch(/2020-jul-21/i);
    });
    describe('with moment reference notations', () => {
      beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2020-02-02 12:01:00'));
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      it('converts named-reference, rounded', () => {
        const time = 'now-1d/d';
        const converted = convertDateTime(time, true);
        expect(converted).toEqual('2020-02-01 00:00:00.000000');
      });
      it.skip('converts named-reference, rounded as end of interval', () => {
        const time = 'now/d';
        const converted = convertDateTime(time);
        expect(converted).toEqual('2020-02-02 23:59:59.999999');
      });
    });
  });
  describe('Metric Query processors', () => {
    const defaultQueryMetaData = {
      catalogSourceName: 'my_catalog',
      catalogTableName: 'metricName',
      aggregation: 'avg',
      attributesGroupBy: [],
      start: 'now-1m',
      end: 'now',
      span: '1',
      resolution: 'h',
    };
    describe('updateCatalogVisualizationQuery', () => {
      it('should build plain promQL series query', () => {
        const query = updateCatalogVisualizationQuery(defaultQueryMetaData);
        expect(query).toMatch(/avg \(metricName\)/);
      });
      it('should build promQL with attributes grouping', () => {
        const query = updateCatalogVisualizationQuery({
          ...defaultQueryMetaData,
          attributesGroupBy: ['label1', 'label2'],
        });
        expect(query).toMatch(/avg by\(label1,label2\) \(metricName\)/);
      });
    });
    describe('preprocessMetricQuery', () => {
      it('should set timestamps and default resolution', () => {
        const [startDate, endDate] = ['2023-11-11', '2023-12-11'];
        const [start, end] = [1699660800, 1702252800]; // 2023-11-11 to 2023-12-11
        const query = preprocessMetricQuery({
          metaData: { queryMetaData: defaultQueryMetaData },
          startTime: startDate,
          endTime: endDate,
        });
        expect(query).toMatch(new RegExp(`, ${start}, ${end}, '1d'`));
      });
    });
  });
});
