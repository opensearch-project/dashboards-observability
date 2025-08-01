/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveFieldValue } from '../traces_custom_indices_table';

describe('resolveFieldValue', () => {
  describe('OpenSearch trace format', () => {
    const openSearchTraceItem = {
      traceId: 'trace-123',
      spanId: 'span-456',
      serviceName: 'user-service',
      operationName: 'GET /users',
      startTime: 1640995200000,
      endTime: 1640995201000,
      durationInNanos: 1000000000,
      status: {
        code: 0,
        message: 'OK',
      },
      attributes: {
        'http.method': 'GET',
        'http.url': 'https://api.example.com/users',
        'http.status_code': 200,
        'user.id': '12345',
      },
      resource: {
        attributes: {
          'service.name': 'user-service',
          'service.version': '1.0.0',
          'deployment.environment': 'production',
        },
      },
      error_count: 0,
      last_updated: 1640995201000,
    };

    it('should resolve direct field values', () => {
      expect(resolveFieldValue(openSearchTraceItem, 'traceId')).toBe('trace-123');
      expect(resolveFieldValue(openSearchTraceItem, 'spanId')).toBe('span-456');
      expect(resolveFieldValue(openSearchTraceItem, 'serviceName')).toBe('user-service');
      expect(resolveFieldValue(openSearchTraceItem, 'operationName')).toBe('GET /users');
      expect(resolveFieldValue(openSearchTraceItem, 'durationInNanos')).toBe(1000000000);
      expect(resolveFieldValue(openSearchTraceItem, 'error_count')).toBe(0);
      expect(resolveFieldValue(openSearchTraceItem, 'last_updated')).toBe(1640995201000);
    });

    it('should resolve nested field values', () => {
      expect(resolveFieldValue(openSearchTraceItem, 'status.code')).toBe(0);
      expect(resolveFieldValue(openSearchTraceItem, 'status.message')).toBe('OK');
    });

    it('should resolve span attributes with attributes prefix', () => {
      expect(resolveFieldValue(openSearchTraceItem, 'attributes.http.method')).toBe('GET');
      expect(resolveFieldValue(openSearchTraceItem, 'attributes.http.url')).toBe(
        'https://api.example.com/users'
      );
      expect(resolveFieldValue(openSearchTraceItem, 'attributes.http.status_code')).toBe(200);
      expect(resolveFieldValue(openSearchTraceItem, 'attributes.user.id')).toBe('12345');
    });

    it('should resolve resource attributes with resource.attributes prefix', () => {
      expect(resolveFieldValue(openSearchTraceItem, 'resource.attributes.service.name')).toBe(
        'user-service'
      );
      expect(resolveFieldValue(openSearchTraceItem, 'resource.attributes.service.version')).toBe(
        '1.0.0'
      );
      expect(
        resolveFieldValue(openSearchTraceItem, 'resource.attributes.deployment.environment')
      ).toBe('production');
    });

    it('should return "-" for non-existent fields', () => {
      expect(resolveFieldValue(openSearchTraceItem, 'nonExistentField')).toBe('-');
      expect(resolveFieldValue(openSearchTraceItem, 'attributes.nonExistent')).toBe('-');
      expect(resolveFieldValue(openSearchTraceItem, 'resource.attributes.nonExistent')).toBe('-');
      expect(resolveFieldValue(openSearchTraceItem, 'status.nonExistent')).toBe('-');
    });
  });

  describe('OTel trace format', () => {
    const otelTraceItem = {
      trace_id: 'otel-trace-789',
      span_id: 'otel-span-012',
      name: 'POST /orders',
      startTimeUnixNano: '1640995200000000000',
      endTimeUnixNano: '1640995201000000000',
      durationInNanos: 1000000000,
      kind: 'SPAN_KIND_SERVER',
      status: {
        code: 2,
        message: 'Error occurred',
      },
      attributes: {
        'http.method': 'POST',
        'http.route': '/orders',
        'http.status_code': 500,
        'order.id': 'order-789',
        error: true,
      },
      resource: {
        attributes: {
          'service.name': 'order-service',
          'service.version': '2.1.0',
          'k8s.pod.name': 'order-service-pod-123',
        },
      },
      error_count: 1,
      endTime: 1640995201000,
    };

    it('should resolve direct field values for OTel format', () => {
      expect(resolveFieldValue(otelTraceItem, 'trace_id')).toBe('otel-trace-789');
      expect(resolveFieldValue(otelTraceItem, 'span_id')).toBe('otel-span-012');
      expect(resolveFieldValue(otelTraceItem, 'name')).toBe('POST /orders');
      expect(resolveFieldValue(otelTraceItem, 'kind')).toBe('SPAN_KIND_SERVER');
      expect(resolveFieldValue(otelTraceItem, 'durationInNanos')).toBe(1000000000);
      expect(resolveFieldValue(otelTraceItem, 'error_count')).toBe(1);
      expect(resolveFieldValue(otelTraceItem, 'endTime')).toBe(1640995201000);
    });

    it('should resolve nested field values for OTel format', () => {
      expect(resolveFieldValue(otelTraceItem, 'status.code')).toBe(2);
      expect(resolveFieldValue(otelTraceItem, 'status.message')).toBe('Error occurred');
    });

    it('should resolve span attributes with span.attributes prefix', () => {
      expect(resolveFieldValue(otelTraceItem, 'span.attributes.http.method')).toBe('POST');
      expect(resolveFieldValue(otelTraceItem, 'span.attributes.http.route')).toBe('/orders');
      expect(resolveFieldValue(otelTraceItem, 'span.attributes.http.status_code')).toBe(500);
      expect(resolveFieldValue(otelTraceItem, 'span.attributes.order.id')).toBe('order-789');
      expect(resolveFieldValue(otelTraceItem, 'span.attributes.error')).toBe(true);
    });

    it('should resolve span attributes with attributes prefix', () => {
      expect(resolveFieldValue(otelTraceItem, 'attributes.http.method')).toBe('POST');
      expect(resolveFieldValue(otelTraceItem, 'attributes.http.route')).toBe('/orders');
      expect(resolveFieldValue(otelTraceItem, 'attributes.http.status_code')).toBe(500);
      expect(resolveFieldValue(otelTraceItem, 'attributes.order.id')).toBe('order-789');
      expect(resolveFieldValue(otelTraceItem, 'attributes.error')).toBe(true);
    });

    it('should resolve resource attributes with resource.attributes prefix', () => {
      expect(resolveFieldValue(otelTraceItem, 'resource.attributes.service.name')).toBe(
        'order-service'
      );
      expect(resolveFieldValue(otelTraceItem, 'resource.attributes.service.version')).toBe('2.1.0');
      expect(resolveFieldValue(otelTraceItem, 'resource.attributes.k8s.pod.name')).toBe(
        'order-service-pod-123'
      );
    });
  });

  describe('Edge cases and error handling', () => {
    it('should return "-" for null or undefined items', () => {
      expect(resolveFieldValue(null, 'anyField')).toBe('-');
      expect(resolveFieldValue(undefined, 'anyField')).toBe('-');
    });

    it('should handle empty objects', () => {
      expect(resolveFieldValue({}, 'anyField')).toBe('-');
    });

    it('should handle items without attributes or resource', () => {
      const itemWithoutAttributes = {
        traceId: 'trace-123',
        spanId: 'span-456',
      };

      expect(resolveFieldValue(itemWithoutAttributes, 'traceId')).toBe('trace-123');
      expect(resolveFieldValue(itemWithoutAttributes, 'attributes.http.method')).toBe('-');
      expect(resolveFieldValue(itemWithoutAttributes, 'resource.attributes.service.name')).toBe(
        '-'
      );
    });

    it('should handle items with null attributes or resource', () => {
      const itemWithNullAttributes = {
        traceId: 'trace-123',
        attributes: null,
        resource: null,
      };

      expect(resolveFieldValue(itemWithNullAttributes, 'traceId')).toBe('trace-123');
      expect(resolveFieldValue(itemWithNullAttributes, 'attributes.http.method')).toBe('-');
      expect(resolveFieldValue(itemWithNullAttributes, 'resource.attributes.service.name')).toBe(
        '-'
      );
    });

    it('should handle deeply nested field paths', () => {
      const itemWithDeepNesting = {
        level1: {
          level2: {
            level3: {
              value: 'deep-value',
            },
          },
        },
      };

      expect(resolveFieldValue(itemWithDeepNesting, 'level1.level2.level3.value')).toBe(
        'deep-value'
      );
      expect(resolveFieldValue(itemWithDeepNesting, 'level1.level2.nonExistent')).toBe('-');
    });

    it('should handle fields with special characters', () => {
      const itemWithSpecialFields = {
        attributes: {
          'http.user-agent': 'Mozilla/5.0',
          custom_field_with_underscores: 'value1',
          'field-with-dashes': 'value2',
        },
      };

      expect(resolveFieldValue(itemWithSpecialFields, 'attributes.http.user-agent')).toBe(
        'Mozilla/5.0'
      );
      expect(
        resolveFieldValue(itemWithSpecialFields, 'attributes.custom_field_with_underscores')
      ).toBe('value1');
      expect(resolveFieldValue(itemWithSpecialFields, 'attributes.field-with-dashes')).toBe(
        'value2'
      );
    });

    it('should handle numeric and boolean values', () => {
      const itemWithMixedTypes = {
        numericField: 42,
        booleanField: true,
        zeroValue: 0,
        falseValue: false,
        attributes: {
          'numeric.attr': 100,
          'boolean.attr': false,
        },
      };

      expect(resolveFieldValue(itemWithMixedTypes, 'numericField')).toBe(42);
      expect(resolveFieldValue(itemWithMixedTypes, 'booleanField')).toBe(true);
      expect(resolveFieldValue(itemWithMixedTypes, 'zeroValue')).toBe(0);
      expect(resolveFieldValue(itemWithMixedTypes, 'falseValue')).toBe(false);
      expect(resolveFieldValue(itemWithMixedTypes, 'attributes.numeric.attr')).toBe(100);
      expect(resolveFieldValue(itemWithMixedTypes, 'attributes.boolean.attr')).toBe(false);
    });
  });

  describe('Field resolution priority', () => {
    it('should prioritize resource.attributes over span.attributes', () => {
      const itemWithConflictingAttributes = {
        attributes: {
          'service.name': 'span-service',
        },
        resource: {
          attributes: {
            'service.name': 'resource-service',
          },
        },
      };

      // resource.attributes should take priority
      expect(
        resolveFieldValue(itemWithConflictingAttributes, 'resource.attributes.service.name')
      ).toBe('resource-service');
      expect(resolveFieldValue(itemWithConflictingAttributes, 'attributes.service.name')).toBe(
        'span-service'
      );
    });

    it('should fall back through resolution chain correctly', () => {
      const itemWithPartialData = {
        directField: 'direct-value',
        nested: {
          field: 'nested-value',
        },
        attributes: {
          'attr.field': 'attr-value',
        },
      };

      // Should find direct field first
      expect(resolveFieldValue(itemWithPartialData, 'directField')).toBe('direct-value');

      // Should find nested field when no attributes match
      expect(resolveFieldValue(itemWithPartialData, 'nested.field')).toBe('nested-value');

      // Should find attribute when prefixed
      expect(resolveFieldValue(itemWithPartialData, 'attributes.attr.field')).toBe('attr-value');

      // Should return '-' when nothing matches
      expect(resolveFieldValue(itemWithPartialData, 'nonExistent')).toBe('-');
    });
  });

  describe('Common trace fields', () => {
    const commonTraceFields = {
      traceId: 'trace-123',
      trace_id: 'trace-456', // OTel format
      spanId: 'span-789',
      span_id: 'span-012', // OTel format
      serviceName: 'test-service',
      operationName: 'test-operation',
      name: 'otel-operation', // OTel format
      startTime: 1640995200000,
      endTime: 1640995201000,
      durationInNanos: 1000000000,
      status: { code: 0 },
      error_count: 0,
      last_updated: 1640995201000,
    };

    it('should handle both OpenSearch and OTel field naming conventions', () => {
      // OpenSearch format
      expect(resolveFieldValue(commonTraceFields, 'traceId')).toBe('trace-123');
      expect(resolveFieldValue(commonTraceFields, 'spanId')).toBe('span-789');
      expect(resolveFieldValue(commonTraceFields, 'serviceName')).toBe('test-service');
      expect(resolveFieldValue(commonTraceFields, 'operationName')).toBe('test-operation');

      // OTel format
      expect(resolveFieldValue(commonTraceFields, 'trace_id')).toBe('trace-456');
      expect(resolveFieldValue(commonTraceFields, 'span_id')).toBe('span-012');
      expect(resolveFieldValue(commonTraceFields, 'name')).toBe('otel-operation');

      // Common fields
      expect(resolveFieldValue(commonTraceFields, 'startTime')).toBe(1640995200000);
      expect(resolveFieldValue(commonTraceFields, 'endTime')).toBe(1640995201000);
      expect(resolveFieldValue(commonTraceFields, 'durationInNanos')).toBe(1000000000);
      expect(resolveFieldValue(commonTraceFields, 'status.code')).toBe(0);
      expect(resolveFieldValue(commonTraceFields, 'error_count')).toBe(0);
      expect(resolveFieldValue(commonTraceFields, 'last_updated')).toBe(1640995201000);
    });
  });
});
