/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeRange } from '../../common/types/service_types';
import { DATA_PREPPER_INDEX_NAME } from '../../../../../common/constants/trace_analytics';
import { coreRefs } from '../../../../framework/core_refs';

/**
 * Escapes special characters in strings for safe PPL query interpolation
 * Prevents PPL injection attacks
 */
function escapePPLString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Constants for navigation
// TODO: These should eventually come from APM config or be resolved dynamically
const DEFAULT_PPL_DATA_SOURCE_ID = '43e06e00-eb53-11f0-9094-6128e3ef36f7';
const DEFAULT_LOGS_DATASET = 'ss4o_logs-*-*';
const DEFAULT_TRACES_DATASET = 'ss4o_traces-*-*';
const INDEX_PATTERN_ID = '49e6bf8f-dfbd-4267-947b-a02c3bf9f3bd';
const EXPLORE_APP_ID = 'explore';

/**
 * Navigates to the discover/traces page filtered by service error spans
 * Uses navigateToApp to automatically handle workspace context
 *
 * @param serviceName - The service to filter by
 * @param timeRange - The time range for the query
 */
export function navigateToErrorTraces(serviceName: string, timeRange: TimeRange): void {
  const dataSourceId = DEFAULT_PPL_DATA_SOURCE_ID;
  const indexPattern = DATA_PREPPER_INDEX_NAME;

  // Construct PPL query to filter by service name and error status
  const pplQuery = `| where serviceName = "${escapePPLString(
    serviceName
  )}" | where \`status.code\` > 0`;

  // Build path using RISON-like format (OpenSearch Dashboards URL state format)
  // Format: _q=(dataset:(...),language:PPL,query:'...')&_g=(...)
  // Note: We only URL-encode the PPL query string content
  const path = `traces/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${
    timeRange.from
  },to:${
    timeRange.to
  }))&_q=(dataset:(dataSource:(id:'${dataSourceId}',title:os-3.3,type:OpenSearch,version:'3.3.0'),id:'${dataSourceId}::${INDEX_PATTERN_ID}',schemaMappings:(),signalType:traces,timeFieldName:startTime,title:'${indexPattern}',type:INDEX_PATTERN),language:PPL,query:'${encodeURIComponent(
    pplQuery
  )}')`;

  // Use navigateToApp to handle workspace context automatically
  coreRefs.application?.navigateToApp(EXPLORE_APP_ID, { path });
}

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
 * Navigates to the discover/logs page filtered by service
 * Uses navigateToApp to automatically handle workspace context
 *
 * @param serviceName - The service to filter by
 * @param environment - The environment to filter by
 * @param timeRange - The time range for the query
 */
export function navigateToServiceLogs(
  serviceName: string,
  environment: string,
  timeRange: TimeRange
): void {
  const dataSourceId = DEFAULT_PPL_DATA_SOURCE_ID;
  const indexPattern = DEFAULT_LOGS_DATASET;

  // Construct PPL query to filter by service name and environment
  const pplQuery = `| where service.name = "${escapePPLString(serviceName)}"${
    environment ? ` | where deployment.environment = "${escapePPLString(environment)}"` : ''
  }`;

  // Build path using RISON-like format (OpenSearch Dashboards URL state format)
  const path = `logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${
    timeRange.from
  },to:${
    timeRange.to
  }))&_q=(dataset:(dataSource:(id:'${dataSourceId}',title:os-3.3,type:OpenSearch,version:'3.3.0'),id:'${dataSourceId}::${INDEX_PATTERN_ID}',schemaMappings:(),signalType:logs,timeFieldName:@timestamp,title:'${indexPattern}',type:INDEX_PATTERN),language:PPL,query:'${encodeURIComponent(
    pplQuery
  )}')`;

  // Use navigateToApp to handle workspace context automatically
  coreRefs.application?.navigateToApp(EXPLORE_APP_ID, { path });
}

/**
 * Navigates to the discover/traces page filtered by service
 * Uses navigateToApp to automatically handle workspace context
 *
 * @param serviceName - The service to filter by
 * @param environment - The environment to filter by
 * @param timeRange - The time range for the query
 */
export function navigateToServiceTraces(
  serviceName: string,
  environment: string,
  timeRange: TimeRange
): void {
  const dataSourceId = DEFAULT_PPL_DATA_SOURCE_ID;
  const indexPattern = DEFAULT_TRACES_DATASET;

  // Construct PPL query to filter by service name and environment
  const pplQuery = `| where serviceName = "${escapePPLString(serviceName)}"${
    environment ? ` | where environment = "${escapePPLString(environment)}"` : ''
  }`;

  // Build path using RISON-like format (OpenSearch Dashboards URL state format)
  const path = `traces/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${
    timeRange.from
  },to:${
    timeRange.to
  }))&_q=(dataset:(dataSource:(id:'${dataSourceId}',title:os-3.3,type:OpenSearch,version:'3.3.0'),id:'${dataSourceId}::${INDEX_PATTERN_ID}',schemaMappings:(),signalType:traces,timeFieldName:startTime,title:'${indexPattern}',type:INDEX_PATTERN),language:PPL,query:'${encodeURIComponent(
    pplQuery
  )}')`;

  // Use navigateToApp to handle workspace context automatically
  coreRefs.application?.navigateToApp(EXPLORE_APP_ID, { path });
}
