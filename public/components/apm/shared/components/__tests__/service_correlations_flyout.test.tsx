/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Test the helper functions and utilities used by the flyout
// Full component rendering tests are skipped due to complex EUI async dependencies

import { getEnvironmentDisplayName } from '../../../common/constants';

import {
  formatSpanKind,
  getStatusColor,
  getStatusLabel,
  getHttpStatusColor,
  getLogLevelColor,
  normalizeLogLevel,
} from '../../utils/format_utils';

describe('ServiceCorrelationsFlyout utilities', () => {
  describe('getEnvironmentDisplayName', () => {
    it('should return prefix before colon', () => {
      expect(getEnvironmentDisplayName('generic:default')).toBe('generic');
      expect(getEnvironmentDisplayName('eks:cluster/namespace')).toBe('eks');
    });

    it('should return full string if no colon', () => {
      expect(getEnvironmentDisplayName('production')).toBe('production');
    });

    it('should return empty string for empty input', () => {
      expect(getEnvironmentDisplayName('')).toBe('');
    });
  });

  describe('formatSpanKind', () => {
    it('should strip SPAN_KIND_ prefix', () => {
      expect(formatSpanKind('SPAN_KIND_SERVER')).toBe('SERVER');
      expect(formatSpanKind('SPAN_KIND_CLIENT')).toBe('CLIENT');
    });

    it('should return "-" for undefined', () => {
      expect(formatSpanKind(undefined)).toBe('-');
    });
  });

  describe('getStatusColor', () => {
    it('should return correct colors for status codes', () => {
      expect(getStatusColor(0)).toBe('success'); // OK
      expect(getStatusColor(2)).toBe('danger'); // ERROR
      expect(getStatusColor(1)).toBe('default'); // UNSET
    });
  });

  describe('getStatusLabel', () => {
    it('should return correct labels for status codes', () => {
      expect(getStatusLabel(0)).toBe('OK');
      expect(getStatusLabel(2)).toBe('ERROR');
      expect(getStatusLabel(1)).toBe('UNSET');
    });
  });

  describe('getHttpStatusColor', () => {
    it('should return correct colors for HTTP status ranges', () => {
      expect(getHttpStatusColor(200)).toBe('success');
      expect(getHttpStatusColor(301)).toBe('accent');
      expect(getHttpStatusColor(404)).toBe('warning');
      expect(getHttpStatusColor(500)).toBe('danger');
    });
  });

  describe('getLogLevelColor', () => {
    it('should return correct colors for log levels', () => {
      expect(getLogLevelColor('error')).toBe('danger');
      expect(getLogLevelColor('warn')).toBe('warning');
      expect(getLogLevelColor('info')).toBe('primary');
      expect(getLogLevelColor('debug')).toBe('default');
    });
  });

  describe('normalizeLogLevel', () => {
    it('should normalize log levels from text', () => {
      expect(normalizeLogLevel('ERROR')).toBe('error');
      expect(normalizeLogLevel('WARN')).toBe('warn');
      expect(normalizeLogLevel('INFO')).toBe('info');
    });

    it('should normalize from severityNumber', () => {
      expect(normalizeLogLevel('', 17)).toBe('error');
      expect(normalizeLogLevel('', 13)).toBe('warn');
      expect(normalizeLogLevel('', 9)).toBe('info');
    });
  });
});
