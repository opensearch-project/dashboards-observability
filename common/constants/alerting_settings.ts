/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// UI Setting keys for the Alert Manager feature. The on/off toggle itself is
// an opensearch_dashboards.yml flag (`observability.alertManager.enabled`),
// not a uiSetting — the two below are only registered when that flag is on.
export const ALERT_MANAGER_DEFAULT_DATASOURCES_SETTING =
  'observability:alertManagerSelectedDatasources';
export const ALERT_MANAGER_MAX_DATASOURCES_SETTING = 'observability:alertManagerMaxDatasources';

// Hard upper bound on the max-datasources setting so an admin can't accidentally
// un-cap the selection and trigger N-wide fan-out queries.
export const ALERT_MANAGER_MAX_DATASOURCES_LIMIT = 20;
export const ALERT_MANAGER_MAX_DATASOURCES_DEFAULT = 5;

// The max-datasources setting counts a CloudWatch account once, whatever the number of regions
// selected. This bounds the CloudWatch (account, region) datasources per selection and per
// request instead, so the AWS calls of one request stay bounded.
export const ALERT_MANAGER_MAX_CLOUDWATCH_PAIRS = ALERT_MANAGER_MAX_DATASOURCES_LIMIT;

// localStorage key for persisting the user's datasource selection across page reloads.
// Stored as a JSON array of datasource names (stable across server restarts, unlike ds-N ids).
export const ALERT_MANAGER_SELECTED_DS_STORAGE_KEY =
  'observability.alertManager.selectedDatasources';

// localStorage key for the CloudWatch regions the user picked: a JSON array of region codes.
export const ALERT_MANAGER_CLOUDWATCH_REGIONS_STORAGE_KEY =
  'observability.alertManager.cloudWatchRegions';
