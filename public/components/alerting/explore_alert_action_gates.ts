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
   * Data source engine types: `dataset.dataSource.engineType`, else `dataset.dataSource.type`
   * (index datasets put the literal `DATA_SOURCE` in `type` and the engine in `engineType`).
   * The local cluster matches `''`. Omit to accept any data source.
   */
  dataSourceTypes?: string[];
}

// The parts of a dataset's data source read here; datasets carry more (title, version, meta).
interface DataSourceLike {
  id?: string;
  type?: string;
  engineType?: string;
  [key: string]: unknown;
}

interface ExploreQueryLike {
  language?: string;
  dataset?: { type?: string; dataSource?: DataSourceLike };
}

// Monitors run on OpenSearch clusters: the local one, or a data source whose engine is OpenSearch.
// Data sources saved before engine detection report `No Engine Type Available`; they got the
// action before this list existed, so they keep it.
const LOCAL_CLUSTER = '';
const OPENSEARCH_ENGINES = [LOCAL_CLUSTER, 'OpenSearch', 'No Engine Type Available'];

// The engine a dataset runs on. Index patterns on the local cluster have no data source, and
// indexes on it get `{ id: '', type: 'DATA_SOURCE' }`; both are the local cluster. Otherwise the
// engine is `engineType` (set on indexes), else `type` (the engine, on index patterns).
const engineOf = (dataSource?: DataSourceLike) =>
  !dataSource || !dataSource.id
    ? LOCAL_CLUSTER
    : (dataSource.engineType ?? dataSource.type ?? LOCAL_CLUSTER);

const defaults = (): Record<ExploreAlertRuleKind, ExploreAlertSupport[]> => ({
  // The Logs rule flyout builds a PPL monitor from the query in the editor, so PPL only.
  logs: [
    {
      datasetTypes: ['INDEX_PATTERN', 'INDEXES'],
      languages: ['PPL'],
      dataSourceTypes: OPENSEARCH_ENGINES,
    },
  ],
  // The Metrics rule flyout targets the dataset's Prometheus connection (the dataset id).
  // Prometheus datasets have no OpenSearch engine, so no engine check.
  metrics: [
    {
      datasetTypes: ['PROMETHEUS'],
      languages: ['PROMQL'],
    },
  ],
});

let supported = defaults();

/**
 * Adds a combination the action for `kind` supports, on top of the built-in ones. Entries can
 * only be added, not removed. The flyouts are unchanged, so an entry must be one the flyout can
 * handle: PPL on OpenSearch for `logs`, and a Prometheus connection for `metrics`, whose flyout
 * uses `dataset.dataSource.id`, else `dataset.id`, as the connection.
 */
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
  const dataSourceType = engineOf(query.dataset?.dataSource);
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
