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
 * OpenTelemetry SeverityNumber ranges and the matching SeverityText keyword for
 * each normalized log level, ordered high → low. Single source of truth shared by
 * normalizeLogLevel (client-side classification) and buildLogLevelPplWhere
 * (server-side PPL filter) so the two can never drift apart.
 * SeverityNumber ranges (OpenTelemetry spec):
 *   1-4: TRACE, 5-8: DEBUG, 9-12: INFO, 13-16: WARN, 17-20: ERROR, 21-24: FATAL
 */
const LOG_LEVEL_DEFS = [
  { level: 'fatal', min: 21, max: 24, keyword: 'fatal' },
  { level: 'error', min: 17, max: 20, keyword: 'error' },
  { level: 'warn', min: 13, max: 16, keyword: 'warn' },
  { level: 'info', min: 9, max: 12, keyword: 'info' },
  { level: 'debug', min: 5, max: 8, keyword: 'debug' },
  { level: 'trace', min: 1, max: 4, keyword: 'trace' },
] as const;

/**
 * Normalize log level from SeverityText or SeverityNumber.
 */
export function normalizeLogLevel(level: string, severityNumber?: number): string {
  // First try SeverityNumber if available
  if (severityNumber !== undefined && severityNumber > 0) {
    const byNumber = LOG_LEVEL_DEFS.find((def) => severityNumber >= def.min);
    if (byNumber) return byNumber.level;
  }

  // Fall back to SeverityText (substring match, matches 'warning', 'ERROR', ...)
  const levelLower = (level || '').toLowerCase();
  const byText = LOG_LEVEL_DEFS.find((def) => levelLower.includes(def.keyword));
  return byText ? byText.level : 'other';
}

/**
 * Build a PPL `| where` clause selecting logs of the given normalized level,
 * mirroring normalizeLogLevel's own thresholds/keywords so the server-side filter
 * and client-side classification can't diverge. Both the number and text fields are
 * coalesced across their OTel-convention names: coalesce tolerates a name that is
 * absent from the index mapping, whereas a bare reference to a missing field errors
 * in PPL. `severity.text`/`severity.number` (nested) are used instead of the bare
 * `severity` object, which is a struct and cannot be passed to LOWER or compared.
 * Returns '' for 'all' or an unknown level.
 */
export function buildLogLevelPplWhere(level: string): string {
  const def = LOG_LEVEL_DEFS.find((d) => d.level === level);
  if (!def) return '';
  const num = 'cast(coalesce(`severityNumber`, `severity.number`) as int)';
  const text = 'LOWER(coalesce(`severityText`, `severity.text`, `level`))';
  return (
    ` | where (${num} >= ${def.min} AND ${num} <= ${def.max})` +
    ` OR ((isnull(${num}) OR ${num} <= 0) AND ${text} LIKE '%${def.keyword}%')`
  );
}

/**
 * Build a PPL `| where` clause for an HTTP-status bucket (http-2xx … http-5xx).
 * The status-code field is coalesced across its two OTel-convention names
 * (`http.response.status_code` current, `http.status_code` deprecated); coalesce
 * tolerates whichever is absent from the index mapping. cast(... as int) is
 * required because the field is keyword-typed on some indices and long on others.
 * Returns '' for a non-HTTP bucket (e.g. 'all', 'error').
 */
export function buildHttpStatusPplWhere(bucket: string): string {
  const code =
    'cast(coalesce(`attributes.http.response.status_code`, `attributes.http.status_code`) as int)';
  switch (bucket) {
    case 'http-2xx':
      return ` | where ${code} >= 200 AND ${code} < 300`;
    case 'http-3xx':
      return ` | where ${code} >= 300 AND ${code} < 400`;
    case 'http-4xx':
      return ` | where ${code} >= 400 AND ${code} < 500`;
    case 'http-5xx':
      return ` | where ${code} >= 500`;
    default:
      return '';
  }
}

/**
 * Sanitizes a string value for safe use in PPL queries.
 * Escapes backslashes and single quotes to prevent query injection.
 */
export function sanitizeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
