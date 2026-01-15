/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Format span kind for display - strips "SPAN_KIND_" prefix
 */
export function formatSpanKind(kind: string | undefined): string {
  if (!kind) return '-';
  return kind.replace('SPAN_KIND_', '');
}

/**
 * Get status badge color based on OpenTelemetry status code
 * @param statusCode - 0: OK, 1: UNSET, 2: ERROR
 */
export function getStatusColor(statusCode: number): string {
  if (statusCode === 0) return 'success'; // OK
  if (statusCode === 2) return 'danger'; // ERROR
  return 'default'; // UNSET or unknown
}

/**
 * Get status label based on OpenTelemetry status code
 * @param statusCode - 0: OK, 1: UNSET, 2: ERROR
 */
export function getStatusLabel(statusCode: number): string {
  if (statusCode === 0) return 'OK';
  if (statusCode === 2) return 'ERROR';
  return 'UNSET';
}

/**
 * Get HTTP status text color based on status code range
 * Returns EuiText color prop values
 */
export function getHttpStatusColor(httpStatus: number | string) {
  const status = Number(httpStatus);
  if (isNaN(status)) return 'default';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'accent';
  if (status >= 400 && status < 500) return 'warning';
  if (status >= 500) return 'danger';
  return 'default';
}

/**
 * Get log level badge color
 */
export function getLogLevelColor(level: string): string {
  const levelLower = (level || '').toLowerCase();
  if (levelLower === 'error' || levelLower === 'fatal') return 'danger';
  if (levelLower === 'warn' || levelLower === 'warning') return 'warning';
  if (levelLower === 'info') return 'primary';
  if (levelLower === 'debug' || levelLower === 'trace') return 'default';
  return 'hollow';
}

/**
 * Normalize log level from SeverityText or SeverityNumber
 * SeverityNumber ranges (OpenTelemetry spec):
 *   1-4: TRACE, 5-8: DEBUG, 9-12: INFO, 13-16: WARN, 17-20: ERROR, 21-24: FATAL
 */
export function normalizeLogLevel(level: string, severityNumber?: number): string {
  // First try SeverityNumber if available
  if (severityNumber !== undefined && severityNumber > 0) {
    if (severityNumber >= 21) return 'fatal';
    if (severityNumber >= 17) return 'error';
    if (severityNumber >= 13) return 'warn';
    if (severityNumber >= 9) return 'info';
    if (severityNumber >= 5) return 'debug';
    if (severityNumber >= 1) return 'trace';
  }

  // Fall back to SeverityText
  const levelLower = (level || '').toLowerCase();
  if (levelLower.includes('fatal')) return 'fatal';
  if (levelLower.includes('error')) return 'error';
  if (levelLower.includes('warn')) return 'warn';
  if (levelLower.includes('info')) return 'info';
  if (levelLower.includes('debug')) return 'debug';
  if (levelLower.includes('trace')) return 'trace';
  return 'other';
}
