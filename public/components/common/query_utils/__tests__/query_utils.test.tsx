/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { parsePromQLIntoKeywords } from '../';

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
      console.log('should parse simple ppl query_range into keywords');
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
      console.log('should parse promql into keywords');
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
});
