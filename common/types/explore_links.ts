/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A query that can be opened in Explore (Discover Logs / Metrics / Traces).
 *
 * Any alert, rule or SLO source can describe "where to look" with one of these, and one builder
 * (`public/components/common/explore_links`) turns it into an Explore link. The target names the
 * dataset as Explore's URL state expects it (any dataset type registered with the data plugin's
 * dataset service), the query language and the query. The time range is not part of the target:
 * the caller supplies it from context (an alert's firing window, a page's time picker).
 */
export type ExploreSignal = 'logs' | 'metrics' | 'traces';

export const EXPLORE_SIGNALS: readonly ExploreSignal[] = ['logs', 'metrics', 'traces'];

export interface ExploreDatasetRef {
  /** The dataset id as Explore expects it for this dataset type. */
  id: string;
  title?: string;
  /** A dataset type registered with the dataset service, e.g. `INDEX_PATTERN`, `PROMETHEUS`. */
  type: string;
  timeFieldName?: string;
  /** The dataset's data source, as Explore stores it (`meta`: string values only). */
  dataSource?: { id?: string; title?: string; type?: string; meta?: Record<string, string> };
}

export interface ExploreQueryTarget {
  /** Which Explore page opens: Logs, Metrics or Traces. */
  signal: ExploreSignal;
  dataset: ExploreDatasetRef;
  /** A language id registered for the dataset type, e.g. `PPL`, `PROMQL`. */
  language: string;
  query: string;
  /** Short text naming what the link opens (e.g. the metric), when there is more than one. */
  label?: string;
  /** The object's own query (`signal`, the default) or a related view (`related`). */
  role?: 'signal' | 'related';
}

/** A time range for an Explore link: date math (`now-1h`) or ISO timestamps. */
export interface ExploreTimeRange {
  from: string;
  to: string;
}
