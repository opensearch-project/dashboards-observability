/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** An APM dataset as configured in the APM settings. */
export interface ApmDatasetRef {
  id: string;
  title: string;
  datasourceId?: string;
}

/** The dataset shape PPLSearchService expects, routed to the dataset's data source (MDS). */
export const toPplDataset = (ds: ApmDatasetRef) => ({
  id: ds.id,
  title: ds.title,
  ...(ds.datasourceId && { dataSource: { id: ds.datasourceId, type: 'DATA_SOURCE' } }),
});
