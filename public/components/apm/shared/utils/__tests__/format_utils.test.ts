/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  formatSpanKind,
  getStatusColor,
  getStatusLabel,
  getHttpStatusColor,
  getLogLevelColor,
  normalizeLogLevel,
} from '../format_utils';

describe('format_utils', () => {
  describe('formatSpanKind', () => {
    it('should return "-" for undefined', () => {
      expect(formatSpanKind(undefined)).toBe('-');
    });

    it('should return "-" for empty string', () => {
      expect(formatSpanKind('')).toBe('-');
    });

    it('should strip SPAN_KIND_ prefix', () => {
      expect(formatSpanKind('SPAN_KIND_SERVER')).toBe('SERVER');
      expect(formatSpanKind('SPAN_KIND_CLIENT')).toBe('CLIENT');
      expect(formatSpanKind('SPAN_KIND_PRODUCER')).toBe('PRODUCER');
      expect(formatSpanKind('SPAN_KIND_CONSUMER')).toBe('CONSUMER');
      expect(formatSpanKind('SPAN_KIND_INTERNAL')).toBe('INTERNAL');
    });

    it('should return original string if no prefix', () => {
      expect(formatSpanKind('SERVER')).toBe('SERVER');
      expect(formatSpanKind('CLIENT')).toBe('CLIENT');
    });
  });

  describe('getStatusColor', () => {
    it('should return success for status 0 (OK)', () => {
      expect(getStatusColor(0)).toBe('success');
    });

    it('should return danger for status 2 (ERROR)', () => {
      expect(getStatusColor(2)).toBe('danger');
    });

    it('should return default for status 1 (UNSET)', () => {
      expect(getStatusColor(1)).toBe('default');
    });

    it('should return default for unknown status codes', () => {
      expect(getStatusColor(3)).toBe('default');
      expect(getStatusColor(-1)).toBe('default');
      expect(getStatusColor(99)).toBe('default');
    });
  });

  describe('getStatusLabel', () => {
    it('should return OK for status 0', () => {
      expect(getStatusLabel(0)).toBe('OK');
    });

    it('should return ERROR for status 2', () => {
      expect(getStatusLabel(2)).toBe('ERROR');
    });

    it('should return UNSET for status 1', () => {
      expect(getStatusLabel(1)).toBe('UNSET');
    });

    it('should return UNSET for unknown status codes', () => {
      expect(getStatusLabel(3)).toBe('UNSET');
      expect(getStatusLabel(-1)).toBe('UNSET');
    });
  });

  describe('getHttpStatusColor', () => {
    it('should return success for 2xx status codes', () => {
      expect(getHttpStatusColor(200)).toBe('success');
      expect(getHttpStatusColor(201)).toBe('success');
      expect(getHttpStatusColor(204)).toBe('success');
      expect(getHttpStatusColor(299)).toBe('success');
    });

    it('should return accent for 3xx status codes', () => {
      expect(getHttpStatusColor(300)).toBe('accent');
      expect(getHttpStatusColor(301)).toBe('accent');
      expect(getHttpStatusColor(304)).toBe('accent');
      expect(getHttpStatusColor(399)).toBe('accent');
    });

    it('should return warning for 4xx status codes', () => {
      expect(getHttpStatusColor(400)).toBe('warning');
      expect(getHttpStatusColor(401)).toBe('warning');
      expect(getHttpStatusColor(404)).toBe('warning');
      expect(getHttpStatusColor(499)).toBe('warning');
    });

    it('should return danger for 5xx status codes', () => {
      expect(getHttpStatusColor(500)).toBe('danger');
      expect(getHttpStatusColor(502)).toBe('danger');
      expect(getHttpStatusColor(503)).toBe('danger');
      expect(getHttpStatusColor(599)).toBe('danger');
    });

    it('should return default for status codes outside valid ranges', () => {
      expect(getHttpStatusColor(100)).toBe('default');
      expect(getHttpStatusColor(199)).toBe('default');
      expect(getHttpStatusColor(0)).toBe('default');
    });

    it('should handle string status codes', () => {
      expect(getHttpStatusColor('200')).toBe('success');
      expect(getHttpStatusColor('404')).toBe('warning');
      expect(getHttpStatusColor('500')).toBe('danger');
    });

    it('should return default for invalid string values', () => {
      expect(getHttpStatusColor('invalid')).toBe('default');
      expect(getHttpStatusColor('')).toBe('default');
    });
  });

  describe('getLogLevelColor', () => {
    it('should return danger for error level', () => {
      expect(getLogLevelColor('error')).toBe('danger');
      expect(getLogLevelColor('ERROR')).toBe('danger');
      expect(getLogLevelColor('Error')).toBe('danger');
    });

    it('should return danger for fatal level', () => {
      expect(getLogLevelColor('fatal')).toBe('danger');
      expect(getLogLevelColor('FATAL')).toBe('danger');
    });

    it('should return warning for warn level', () => {
      expect(getLogLevelColor('warn')).toBe('warning');
      expect(getLogLevelColor('WARN')).toBe('warning');
      expect(getLogLevelColor('warning')).toBe('warning');
      expect(getLogLevelColor('WARNING')).toBe('warning');
    });

    it('should return primary for info level', () => {
      expect(getLogLevelColor('info')).toBe('primary');
      expect(getLogLevelColor('INFO')).toBe('primary');
    });

    it('should return default for debug level', () => {
      expect(getLogLevelColor('debug')).toBe('default');
      expect(getLogLevelColor('DEBUG')).toBe('default');
    });

    it('should return default for trace level', () => {
      expect(getLogLevelColor('trace')).toBe('default');
      expect(getLogLevelColor('TRACE')).toBe('default');
    });

    it('should return hollow for unknown levels', () => {
      expect(getLogLevelColor('unknown')).toBe('hollow');
      expect(getLogLevelColor('custom')).toBe('hollow');
    });

    it('should handle undefined and empty values', () => {
      expect(getLogLevelColor('')).toBe('hollow');
    });
  });

  describe('normalizeLogLevel', () => {
    describe('with severityNumber', () => {
      it('should return fatal for severityNumber >= 21', () => {
        expect(normalizeLogLevel('', 21)).toBe('fatal');
        expect(normalizeLogLevel('', 24)).toBe('fatal');
      });

      it('should return error for severityNumber 17-20', () => {
        expect(normalizeLogLevel('', 17)).toBe('error');
        expect(normalizeLogLevel('', 20)).toBe('error');
      });

      it('should return warn for severityNumber 13-16', () => {
        expect(normalizeLogLevel('', 13)).toBe('warn');
        expect(normalizeLogLevel('', 16)).toBe('warn');
      });

      it('should return info for severityNumber 9-12', () => {
        expect(normalizeLogLevel('', 9)).toBe('info');
        expect(normalizeLogLevel('', 12)).toBe('info');
      });

      it('should return debug for severityNumber 5-8', () => {
        expect(normalizeLogLevel('', 5)).toBe('debug');
        expect(normalizeLogLevel('', 8)).toBe('debug');
      });

      it('should return trace for severityNumber 1-4', () => {
        expect(normalizeLogLevel('', 1)).toBe('trace');
        expect(normalizeLogLevel('', 4)).toBe('trace');
      });

      it('should ignore severityNumber when 0 or negative', () => {
        expect(normalizeLogLevel('error', 0)).toBe('error');
        expect(normalizeLogLevel('info', -1)).toBe('info');
      });
    });

    describe('with text level fallback', () => {
      it('should detect fatal in text', () => {
        expect(normalizeLogLevel('fatal')).toBe('fatal');
        expect(normalizeLogLevel('FATAL')).toBe('fatal');
        expect(normalizeLogLevel('fatal error')).toBe('fatal');
      });

      it('should detect error in text', () => {
        expect(normalizeLogLevel('error')).toBe('error');
        expect(normalizeLogLevel('ERROR')).toBe('error');
        expect(normalizeLogLevel('error message')).toBe('error');
      });

      it('should detect warn in text', () => {
        expect(normalizeLogLevel('warn')).toBe('warn');
        expect(normalizeLogLevel('warning')).toBe('warn');
        expect(normalizeLogLevel('WARN')).toBe('warn');
      });

      it('should detect info in text', () => {
        expect(normalizeLogLevel('info')).toBe('info');
        expect(normalizeLogLevel('INFO')).toBe('info');
        expect(normalizeLogLevel('information')).toBe('info');
      });

      it('should detect debug in text', () => {
        expect(normalizeLogLevel('debug')).toBe('debug');
        expect(normalizeLogLevel('DEBUG')).toBe('debug');
      });

      it('should detect trace in text', () => {
        expect(normalizeLogLevel('trace')).toBe('trace');
        expect(normalizeLogLevel('TRACE')).toBe('trace');
      });

      it('should return other for unknown levels', () => {
        expect(normalizeLogLevel('unknown')).toBe('other');
        expect(normalizeLogLevel('')).toBe('other');
        expect(normalizeLogLevel('custom_level')).toBe('other');
      });
    });

    describe('priority', () => {
      it('should prioritize severityNumber over text', () => {
        // SeverityNumber indicates error (17) but text says info
        expect(normalizeLogLevel('info', 17)).toBe('error');
        // SeverityNumber indicates info (9) but text says fatal
        expect(normalizeLogLevel('fatal', 9)).toBe('info');
      });
    });
  });
});
