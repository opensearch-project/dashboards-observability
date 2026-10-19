/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * When Explore's query panel offers our "Create alert rule" actions. Explore can show datasets,
 * languages and data sources that other plugins add, so each action is offered only for the
 * combinations listed here as supported. A deployment that supports more registers them through
 * the plugin's setup contract (`exploreAlerting.addSupported`).
 */

/** Which of our two "Create alert rule" actions an entry applies to. */
export type ExploreAlertRuleKind = 'logs' | 'metrics';

/** A combination of query that an action's flyout can turn into a rule. */
export interface ExploreAlertSupport {
  /** Dataset types, e.g. `INDEX_PATTERN` or `PROMETHEUS`. */
  datasetTypes: string[];
  /** Query languages (matched case-insensitively), e.g. `PPL` or `PROMQL`. */
  languages: string[];
  /**
   * Data source engine types (`dataset.dataSource.type`). Omit to accept any, including datasets
   * without a data source (the local cluster).
   */
  dataSourceTypes?: string[];
}

interface ExploreQueryLike {
  language?: string;
  dataset?: { type?: string; dataSource?: { type?: string } };
}

// The local cluster has no data source; a remote one must be an OpenSearch cluster, which is
// what can host monitors.
const LOCAL_CLUSTER = '';
const OPENSEARCH_ENGINES = [LOCAL_CLUSTER, 'OpenSearch'];

const defaults = (): Record<ExploreAlertRuleKind, ExploreAlertSupport[]> => ({
  // The Logs rule flyout builds a monitor from the PPL or SQL query in the editor.
  logs: [
    {
      datasetTypes: ['INDEX_PATTERN', 'INDEXES'],
      languages: ['PPL', 'SQL'],
      dataSourceTypes: OPENSEARCH_ENGINES,
    },
  ],
  // The Metrics rule flyout targets the dataset's Prometheus connection (the dataset id).
  metrics: [
    {
      datasetTypes: ['PROMETHEUS'],
      languages: ['PROMQL'],
      dataSourceTypes: OPENSEARCH_ENGINES,
    },
  ],
});

let supported = defaults();

/** Adds a combination the action for `kind` supports, on top of the built-in ones. */
export const addExploreAlertSupport = (
  kind: ExploreAlertRuleKind,
  support: ExploreAlertSupport
) => {
  supported[kind] = [...supported[kind], support];
};

/** Restores the built-in list. For tests. */
export const resetExploreAlertSupport = () => {
  supported = defaults();
};

const matches = (query: ExploreQueryLike, support: ExploreAlertSupport) => {
  const language = query.language?.toUpperCase();
  const dataSourceType = query.dataset?.dataSource?.type ?? LOCAL_CLUSTER;
  return (
    !!query.dataset?.type &&
    support.datasetTypes.includes(query.dataset.type) &&
    !!language &&
    support.languages.some((supportedLanguage) => supportedLanguage.toUpperCase() === language) &&
    (!support.dataSourceTypes || support.dataSourceTypes.includes(dataSourceType))
  );
};

/** Whether the action for `kind` can create a rule from this query. */
export const isExploreAlertSupported = (
  kind: ExploreAlertRuleKind,
  query: ExploreQueryLike | undefined
): boolean => !!query && supported[kind].some((support) => matches(query, support));

/** Logs (PPL) rule: PPL alerting is on and the query is a supported one. */
export const isLogsAlertActionEnabled = (
  query: ExploreQueryLike | undefined,
  pplAlertingEnabled: boolean
): boolean => pplAlertingEnabled && isExploreAlertSupported('logs', query);

/** Metrics (PromQL) rule: the query is a supported one. */
export const isMetricsAlertActionEnabled = (query: ExploreQueryLike | undefined): boolean =>
  isExploreAlertSupported('metrics', query);
