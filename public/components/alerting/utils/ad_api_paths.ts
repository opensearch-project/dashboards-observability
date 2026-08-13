/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const ALERT_MANAGER_LOCAL_DATASOURCE_ID = 'local-cluster';

/** Translate Alert Manager's datasource identity to the AD/Forecasting route contract. */
export const toAdApiDataSourceId = (datasourceId: string): string =>
  datasourceId === ALERT_MANAGER_LOCAL_DATASOURCE_ID ? '' : datasourceId;

export const withAdApiDataSource = (basePath: string, datasourceId: string): string => {
  const apiDatasourceId = toAdApiDataSourceId(datasourceId);
  return apiDatasourceId ? `${basePath}/${encodeURIComponent(apiDatasourceId)}` : basePath;
};
