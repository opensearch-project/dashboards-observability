/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeRange } from '../../common/types/service_types';
import { TimeRange as ServiceDetailsTimeRange } from '../../common/types/service_details_types';
import { EXPLORE_APP_ID } from '../../common/constants';
import {
  observabilityApmServicesID,
  observabilityApmApplicationMapID,
} from '../../../../../common/constants/apm';
import { coreRefs } from '../../../../framework/core_refs';

/**
 * Options for navigating to service details
 */
export interface NavigateToServiceDetailsOptions {
  tab?: 'overview' | 'operations' | 'dependencies';
  timeRange?: ServiceDetailsTimeRange;
  filters?: Record<string, any>;
  language?: string; // SDK language from telemetry.sdk.language
  /** Operation name to pre-select in filters (for dependencies tab) */
  operation?: string;
  /** Dependency service name to pre-select in filters (for dependencies tab) */
  dependency?: string;
}

/**
 * Navigates to the service details page
 * Uses navigateToApp for workspace-aware navigation
 *
 * @param serviceName - The service name to view
 * @param environment - The environment (optional, defaults to 'generic:default')
 * @param options - Optional navigation options (tab, timeRange, filters)
 */
export function navigateToServiceDetails(
  serviceName: string,
  environment?: string,
  options?: NavigateToServiceDetailsOptions
): void {
  const encodedServiceName = encodeURIComponent(serviceName);
  const encodedEnvironment = encodeURIComponent(environment || 'generic:default');

  // Build query params
  const params = new URLSearchParams();

  if (options?.tab) {
    params.set('tab', options.tab);
  }

  if (options?.timeRange) {
    params.set('from', options.timeRange.from);
    params.set('to', options.timeRange.to);
  }

  if (options?.filters) {
    Object.entries(options.filters).forEach(([key, value]) => {
      params.set(`filter.${key}`, String(value));
    });
  }

  if (options?.language) {
    params.set('lang', options.language);
  }

  // Add operation filter param (for dependencies tab pre-selection)
  if (options?.operation) {
    params.set('operation', options.operation);
  }

  // Add dependency filter param (for dependencies tab pre-selection)
  if (options?.dependency) {
    params.set('dependency', options.dependency);
  }

  // Build path for hash-based routing
  const queryString = params.toString();
  const path = `#/service-details/${encodedServiceName}/${encodedEnvironment}${
    queryString ? `?${queryString}` : ''
  }`;

  // Use navigateToApp for workspace-aware navigation
  coreRefs?.application?.navigateToApp(observabilityApmServicesID, { path });

  // Dispatch hashchange event for HashRouter to detect the URL change
  // (navigateToApp uses pushState which doesn't trigger hashchange)
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Navigates back to services list
 * Uses navigateToApp for workspace-aware navigation
 */
export function navigateToServicesList(): void {
  coreRefs?.application?.navigateToApp(observabilityApmServicesID, { path: '#/services' });

  // Dispatch hashchange event for HashRouter to detect the URL change
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Options for navigating to the service map
 */
export interface NavigateToServiceMapOptions {
  timeRange?: TimeRange;
  /** Focus on a specific service node */
  focusService?: string;
}

/**
 * Navigates to the application map view, optionally filtered by service
 *
 * @param serviceName - The service to focus on (optional)
 * @param environment - The environment to filter by (optional)
 * @param options - Optional navigation options
 */
export function navigateToServiceMap(
  serviceName?: string,
  environment?: string,
  options?: NavigateToServiceMapOptions
): void {
  // Build query params
  const params = new URLSearchParams();

  if (serviceName) {
    params.set('service', serviceName);
  }

  if (environment) {
    params.set('environment', environment);
  }

  if (options?.timeRange) {
    params.set('from', options.timeRange.from);
    params.set('to', options.timeRange.to);
  }

  if (options?.focusService) {
    params.set('focus', options.focusService);
  }

  // Build path for hash-based routing
  const queryString = params.toString();
  const path = `#/application-map${queryString ? `?${queryString}` : ''}`;

  // Use navigateToApp for workspace-aware navigation
  coreRefs?.application?.navigateToApp(observabilityApmApplicationMapID, { path });

  // Dispatch hashchange event for HashRouter to detect the URL change
  window.dispatchEvent(new HashChangeEvent('hashchange'));
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
 * @param operationFilter - Optional operation name to filter by
 */
export function navigateToExploreTraces(
  datasetId: string,
  datasetTitle: string,
  serviceName: string,
  timeRange: TimeRange,
  dataSourceId?: string,
  dataSourceTitle?: string,
  operationFilter?: string
): void {
  // PPL query - URL encoded via encodeURIComponent
  let pplQuery = `| where serviceName = "${serviceName}"`;
  if (operationFilter) {
    pplQuery += ` | where name = "${operationFilter}"`;
  }

  // Build path using RISON format matching expected explore traces URL format
  // Note: Empty strings in RISON must be quoted as ''
  // Note: datasetId is already in correct format from APM config, use as-is
  const dsTitle = dataSourceTitle ? dataSourceTitle : "''";
  const path = `traces/#?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${
    timeRange.from
  },to:${timeRange.to}))&_q=(dataset:(dataSource:(id:'${
    dataSourceId || ''
  }',title:${dsTitle},type:OpenSearch),id:'${datasetId}',schemaMappings:(),signalType:traces,timeFieldName:startTime,title:'${datasetTitle}',type:INDEX_PATTERN),language:PPL,query:'${encodeURIComponent(
    pplQuery
  )}')&_a=(legacy:(columns:!(spanId,status.code,attributes.http.status_code,resource.attributes.service.name,kind,name,durationNano,durationInNanos),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))`;

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
  // Note: datasetId is already in correct format from APM config, use as-is
  const dsTitle = dataSourceTitle ? `'${dataSourceTitle}'` : "''";
  const path = `traces/traceDetails#/?_a=(dataset:(id:'${datasetId}',title:'${datasetTitle}',type:'INDEX_PATTERN',timeFieldName:'startTime',dataSource:(id:'${
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
 * @param traceIds - Optional array of trace IDs to filter by
 * @param traceIdField - Optional field name for traceId (required when traceIds provided)
 */
export function navigateToExploreLogs(
  datasetId: string,
  datasetTitle: string,
  serviceName: string,
  serviceNameField: string,
  timeRange: TimeRange,
  dataSourceId?: string,
  dataSourceTitle?: string,
  traceIds?: string[],
  traceIdField?: string
): void {
  // PPL query - URL encoded via encodeURIComponent below
  // Note: Use double quotes for string literals to avoid RISON single-quote conflicts
  let pplQuery = `| where \`${serviceNameField}\` = "${serviceName}"`;
  if (traceIds && traceIds.length > 0 && traceIdField) {
    const traceIdList = traceIds.map((id) => `"${id}"`).join(', ');
    pplQuery += ` | where \`${traceIdField}\` IN (${traceIdList})`;
  }

  // Build path using RISON format matching expected explore logs URL format
  // Note: datasetId is already in correct format from APM config, use as-is
  const dsTitle = dataSourceTitle ? dataSourceTitle : "''";

  const path = `logs/#?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${
    timeRange.from
  },to:${timeRange.to}))&_q=(dataset:(dataSource:(id:'${
    dataSourceId || ''
  }',title:${dsTitle},type:OpenSearch),id:'${datasetId}',timeFieldName:time,title:'${datasetTitle}',type:INDEX_PATTERN),language:PPL,query:'${encodeURIComponent(
    pplQuery
  )}')&_a=(legacy:(columns:!(_source),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))`;

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
