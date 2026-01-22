/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates a universal WHERE clause for filtering materialized views by timestamp.
 *
 * This works with any integration because:
 * 1. All MV SQL files use a subquery pattern: SELECT * FROM (SELECT ... AS `@timestamp` ...) AS subq
 * 2. The `@timestamp` field is always a TIMESTAMP type after transformation
 * 3. We can filter on `@timestamp` uniformly regardless of the source format
 *
 * @param refreshRangeDays - Number of days to look back (0 = no limit)
 * @returns SQL WHERE clause string, or empty string if no filtering needed
 *
 * @example
 * generateTimestampFilter(7)
 * // Returns: "WHERE `@timestamp` >= '2026-01-14 00:00:00'"
 *
 * @example
 * generateTimestampFilter(0)
 * // Returns: "" (no filtering)
 */
export function generateTimestampFilter(refreshRangeDays: number): string {
  // No filtering if refresh range is 0 (no limit)
  if (refreshRangeDays === 0) {
    return '';
  }

  // Calculate the start date based on refresh range
  const now = new Date();
  const startDate = new Date(now.getTime() - refreshRangeDays * 24 * 60 * 60 * 1000);

  // Format as ISO-like string for SQL TIMESTAMP comparison
  const isoString = startDate
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '');

  return `WHERE \`@timestamp\` >= '${isoString}'`;
}
