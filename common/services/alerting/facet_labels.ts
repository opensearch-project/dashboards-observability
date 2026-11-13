/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The labels a row contributes to the Labels facet. A CloudWatch row's `account` and `region`
 * labels are left out: the Datasource facet (account entries) and its Regions control already
 * filter on them. The row keeps them for text search and the detail flyouts.
 */
const CLOUDWATCH_FACET_HIDDEN_LABELS = new Set(['account', 'region']);

/**
 * The filtered labels per CloudWatch row, so each row is copied once however many facet keys and
 * filters read it. Rows are replaced, never mutated, on each fetch.
 */
const cache = new WeakMap<object, Record<string, string>>();

export function facetLabels(row: {
  datasourceType?: string;
  labels: Record<string, string>;
}): Record<string, string> {
  if (row.datasourceType !== 'cloudwatch') return row.labels;
  const cached = cache.get(row);
  if (cached) return cached;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row.labels)) {
    if (!CLOUDWATCH_FACET_HIDDEN_LABELS.has(k)) out[k] = v;
  }
  cache.set(row, out);
  return out;
}
