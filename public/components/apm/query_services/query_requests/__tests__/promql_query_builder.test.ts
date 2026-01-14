/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromQLQueryBuilder } from '../promql_query_builder';

describe('PromQLQueryBuilder', () => {
  describe('buildQuery', () => {
    describe('rate metrics (error, fault, request)', () => {
      it('should build error rate query without stat', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'error',
          filters: { service: 'api-gateway' },
          interval: '5m',
        });

        expect(result).toBe('rate(error{service="api-gateway"}[5m])');
      });

      it('should build fault rate query with sum stat', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'fault',
          filters: { service: 'api-gateway' },
          stat: 'sum',
          interval: '5m',
        });

        expect(result).toBe('sum(rate(fault{service="api-gateway"}[5m]))');
      });

      it('should build request rate query with avg stat', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'request',
          filters: { service: 'api-gateway' },
          stat: 'avg',
          interval: '1m',
        });

        expect(result).toBe('avg(rate(request{service="api-gateway"}[1m]))');
      });

      it('should build error rate query with max stat', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'error',
          filters: {},
          stat: 'max',
          interval: '5m',
        });

        expect(result).toBe('max(rate(error[5m]))');
      });

      it('should build error rate query with min stat', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'error',
          filters: {},
          stat: 'min',
          interval: '5m',
        });

        expect(result).toBe('min(rate(error[5m]))');
      });

      it('should handle average alias', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'error',
          filters: {},
          stat: 'average',
          interval: '5m',
        });

        expect(result).toBe('avg(rate(error[5m]))');
      });

      it('should handle maximum alias', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'error',
          filters: {},
          stat: 'maximum',
          interval: '5m',
        });

        expect(result).toBe('max(rate(error[5m]))');
      });

      it('should handle minimum alias', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'error',
          filters: {},
          stat: 'minimum',
          interval: '5m',
        });

        expect(result).toBe('min(rate(error[5m]))');
      });

      it('should return base query for unknown stat', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'error',
          filters: {},
          stat: 'unknown',
          interval: '5m',
        });

        expect(result).toBe('rate(error[5m])');
      });
    });

    describe('latency metrics', () => {
      it('should build default latency query (average) without stat', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'latency',
          filters: { service: 'api-gateway' },
          interval: '5m',
        });

        expect(result).toBe(
          'rate(latency_seconds_sum{service="api-gateway"}[5m]) / rate(latency_seconds_count{service="api-gateway"}[5m])'
        );
      });

      it('should build p99 latency query', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'latency',
          filters: { service: 'api-gateway' },
          stat: 'p99',
          interval: '5m',
        });

        expect(result).toBe(
          'histogram_quantile(0.99, rate(latency_seconds_bucket{service="api-gateway"}[5m]))'
        );
      });

      it('should build p90 latency query', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'latency',
          filters: { service: 'api-gateway' },
          stat: 'p90',
          interval: '5m',
        });

        expect(result).toBe(
          'histogram_quantile(0.90, rate(latency_seconds_bucket{service="api-gateway"}[5m]))'
        );
      });

      it('should build p50 latency query', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'latency',
          filters: { service: 'api-gateway' },
          stat: 'p50',
          interval: '5m',
        });

        expect(result).toBe(
          'histogram_quantile(0.50, rate(latency_seconds_bucket{service="api-gateway"}[5m]))'
        );
      });

      it('should build average latency query', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'latency',
          filters: {},
          stat: 'avg',
          interval: '5m',
        });

        expect(result).toBe('rate(latency_seconds_sum[5m]) / rate(latency_seconds_count[5m])');
      });

      it('should build max latency query', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'latency',
          filters: {},
          stat: 'max',
          interval: '5m',
        });

        expect(result).toBe('max_over_time(latency_seconds_max[5m])');
      });

      it('should build min latency query', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'latency',
          filters: {},
          stat: 'min',
          interval: '5m',
        });

        expect(result).toBe('min_over_time(latency_seconds_min[5m])');
      });

      it('should return average for unknown latency stat', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'latency',
          filters: {},
          stat: 'unknown',
          interval: '5m',
        });

        expect(result).toBe('rate(latency_seconds_sum[5m]) / rate(latency_seconds_count[5m])');
      });
    });

    describe('generic metrics', () => {
      it('should build simple metric query for unknown metric names', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'custom_metric',
          filters: { service: 'api-gateway' },
          interval: '5m',
        });

        expect(result).toBe('custom_metric{service="api-gateway"}');
      });

      it('should build metric query without filters', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'custom_metric',
          filters: {},
          interval: '5m',
        });

        expect(result).toBe('custom_metric');
      });
    });

    describe('filters', () => {
      it('should handle empty filters', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'error',
          filters: {},
          interval: '5m',
        });

        expect(result).toBe('rate(error[5m])');
      });

      it('should handle single filter', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'error',
          filters: { service: 'api-gateway' },
          interval: '5m',
        });

        expect(result).toBe('rate(error{service="api-gateway"}[5m])');
      });

      it('should handle multiple filters', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'error',
          filters: { service: 'api-gateway', operation: 'GET /users' },
          interval: '5m',
        });

        expect(result).toContain('service="api-gateway"');
        expect(result).toContain('operation="GET /users"');
      });

      it('should handle filters with special characters in values', () => {
        const result = PromQLQueryBuilder.buildQuery({
          metricName: 'custom_metric',
          filters: { path: '/api/v1/users' },
          interval: '5m',
        });

        expect(result).toBe('custom_metric{path="/api/v1/users"}');
      });
    });
  });
});
