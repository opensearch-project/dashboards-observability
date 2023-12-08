/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { findMinInterval, parsePromQLIntoKeywords } from '../';

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
});
