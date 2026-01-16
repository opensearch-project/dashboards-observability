/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeRange } from '../../common/types/service_types';
import { EXPLORE_APP_ID } from '../../common/constants';
import { coreRefs } from '../../../../framework/core_refs';

/**
 * Navigates to the service map view filtered by service
 * TODO: Implement when topology/service map view is ready
 *
 * @param serviceName - The service to focus on
 * @param environment - The environment to filter by
 */
export function navigateToServiceMap(_serviceName: string, _environment: string): void {
  // TODO: Implement service map navigation when topology view is ready
  // Placeholder - will navigate to application map/topology view
}

/**
 * Navigates to explore/traces page with service filter
 * Uses basePath.prepend for workspace context handling
 *
 * @param datasetId - The trace dataset ID
 * @param datasetTitle - The trace dataset title
 * @param serviceName - The service to filter by
 * @param timeRange - The time range for the query
 * @param dataSourceId - Optional datasource ID
 * @param dataSourceTitle - Optional datasource title
 */
export function navigateToExploreTraces(
  datasetId: string,
  datasetTitle: string,
  serviceName: string,
  timeRange: TimeRange,
  dataSourceId?: string,
  dataSourceTitle?: string
): void {
  // PPL query - URL encoded via encodeURIComponent
  const pplQuery = `| where serviceName = "${serviceName}"`;

  // Build path using RISON format matching expected explore traces URL format
  // Note: Empty strings in RISON must be quoted as ''
  // Note: datasetId may already contain the composite id (dataSourceId::datasetId), so don't prepend again
  const dsTitle = dataSourceTitle ? dataSourceTitle : "''";
  const fullDatasetId = datasetId.includes('::')
    ? datasetId
    : `${dataSourceId || ''}::${datasetId}`;
  const path = `traces/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${
    timeRange.from
  },to:${timeRange.to}))&_q=(dataset:(dataSource:(id:'${
    dataSourceId || ''
  }',title:${dsTitle},type:OpenSearch),id:'${fullDatasetId}',schemaMappings:(),signalType:traces,timeFieldName:startTime,title:'${datasetTitle}',type:INDEX_PATTERN),language:PPL,query:'${encodeURIComponent(
    pplQuery
  )}')&_a=(legacy:(columns:!(spanId,status.code,attributes.http.status_code,resource.attributes.service.name,kind,name,durationNano,durationInNanos),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(patternsField:'',usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))`;

  // Use basePath.prepend to properly handle workspace context
  const fullUrl =
    coreRefs.http?.basePath.prepend(`/app/${EXPLORE_APP_ID}/${path}`) ||
    `/app/${EXPLORE_APP_ID}/${path}`;

  // Open in new tab
  window.open(fullUrl, '_blank');
}

/**
 * Navigates to span/trace details in explore/traces
 * Uses basePath.prepend for workspace context handling
 *
 * @param datasetId - The trace dataset ID (combined format: dataSourceId::datasetId)
 * @param datasetTitle - The trace dataset title
 * @param spanId - The span ID to view
 * @param traceId - The trace ID for the span
 * @param dataSourceId - Optional datasource ID
 * @param dataSourceTitle - Optional datasource title
 */
export function navigateToSpanDetails(
  datasetId: string,
  datasetTitle: string,
  spanId: string,
  traceId: string,
  dataSourceId?: string,
  dataSourceTitle?: string
): void {
  // Build path for trace details page with spanId and traceId
  // Note: Empty strings in RISON must be quoted as ''
  // Note: datasetId may already contain the composite id (dataSourceId::datasetId), so don't prepend again
  const dsTitle = dataSourceTitle ? `'${dataSourceTitle}'` : "''";
  const fullDatasetId = datasetId.includes('::')
    ? datasetId
    : `${dataSourceId || ''}::${datasetId}`;
  const path = `traces/traceDetails#/?_a=(dataset:(id:'${fullDatasetId}',title:'${datasetTitle}',type:'INDEX_PATTERN',timeFieldName:'startTime',dataSource:(id:'${
    dataSourceId || ''
  }',title:${dsTitle},type:'OpenSearch')),spanId:'${spanId}',traceId:'${traceId}')`;

  // Use basePath.prepend to properly handle workspace context
  const fullUrl =
    coreRefs.http?.basePath.prepend(`/app/${EXPLORE_APP_ID}/${path}`) ||
    `/app/${EXPLORE_APP_ID}/${path}`;

  // Open in new tab
  window.open(fullUrl, '_blank');
}

/**
 * Navigates to explore/logs page with service filter
 * Uses basePath.prepend for workspace context handling
 *
 * @param datasetId - The log dataset ID
 * @param datasetTitle - The log dataset title
 * @param serviceName - The service to filter by
 * @param serviceNameField - The field name for service (from schemaMappings)
 * @param timeRange - The time range for the query
 * @param dataSourceId - Optional datasource ID
 * @param dataSourceTitle - Optional datasource title
 */
export function navigateToExploreLogs(
  datasetId: string,
  datasetTitle: string,
  serviceName: string,
  serviceNameField: string,
  timeRange: TimeRange,
  dataSourceId?: string,
  dataSourceTitle?: string
): void {
  // PPL query - URL encoded via encodeURIComponent below
  const pplQuery = `| where \`${serviceNameField}\` = "${serviceName}"`;

  // Build path using RISON format matching expected explore logs URL format
  const dsTitle = dataSourceTitle ? dataSourceTitle : "''";
  const fullDatasetId = datasetId.includes('::')
    ? datasetId
    : `${dataSourceId || ''}::${datasetId}`;

  const path = `logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${
    timeRange.from
  },to:${timeRange.to}))&_q=(dataset:(dataSource:(id:'${
    dataSourceId || ''
  }',title:${dsTitle},type:OpenSearch),id:'${fullDatasetId}',timeFieldName:time,title:'${datasetTitle}',type:INDEX_PATTERN),language:PPL,query:'${encodeURIComponent(
    pplQuery
  )}')&_a=(legacy:(columns:!(_source),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(patternsField:'',usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))`;

  // Use basePath.prepend to properly handle workspace context
  const fullUrl =
    coreRefs.http?.basePath.prepend(`/app/${EXPLORE_APP_ID}/${path}`) ||
    `/app/${EXPLORE_APP_ID}/${path}`;

  // Open in new tab
  window.open(fullUrl, '_blank');
}

/**
 * Navigates to the dataset correlations setup page
 * Uses basePath.prepend for workspace context handling
 *
 * @param datasetId - The trace dataset ID (may include datasource prefix)
 */
export function navigateToDatasetCorrelations(datasetId: string): void {
  const encodedDatasetId = encodeURIComponent(datasetId);
  const path = `datasets/patterns/${encodedDatasetId}#/?_a=(tab:correlatedDatasets)`;

  // Use basePath.prepend to properly handle workspace context
  const fullUrl = coreRefs.http?.basePath.prepend(`/app/${path}`) || `/app/${path}`;

  // Navigate in same tab
  window.location.href = fullUrl;
}
