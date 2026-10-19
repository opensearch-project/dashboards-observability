/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * When Explore's query panel offers our "Create alert rule" actions. Explore can show datasets
 * and languages from other plugins' sources, so each action checks that the active query is one
 * its flyout can turn into a rule, not just which page it is on.
 */

interface ExploreQueryLike {
  language?: string;
  dataset?: { type?: string; dataSource?: { type?: string } };
}

// The Logs rule flyout builds a monitor from the query in the editor, which only works for
// Explore's own query languages.
const LOGS_RULE_LANGUAGES = ['PPL', 'SQL'];

// The Metrics rule flyout targets the dataset's Prometheus connection (the dataset id).
const PROMETHEUS_DATASET_TYPE = 'PROMETHEUS';

// AOSS collections can't host monitors.
const isAOSS = (query: ExploreQueryLike) =>
  query.dataset?.dataSource?.type === 'OpenSearch Serverless';

/** Logs (PPL) rule: PPL alerting is on, the query is PPL or SQL, and the cluster can host it. */
export const isLogsAlertActionEnabled = (
  query: ExploreQueryLike | undefined,
  pplAlertingEnabled: boolean
): boolean => {
  if (!pplAlertingEnabled || !query) return false;
  const language = query.language?.toUpperCase() ?? '';
  return LOGS_RULE_LANGUAGES.includes(language) && !isAOSS(query);
};

/** Metrics (PromQL) rule: a PromQL query on a Prometheus connection the cluster can alert on. */
export const isMetricsAlertActionEnabled = (query: ExploreQueryLike | undefined): boolean => {
  if (!query) return false;
  return (
    query.language?.toUpperCase() === 'PROMQL' &&
    query.dataset?.type === PROMETHEUS_DATASET_TYPE &&
    !isAOSS(query)
  );
};
