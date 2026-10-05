/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { combineLatest, of } from 'rxjs';
import { AppNavLinkStatus, AppStatus } from '../../../../../../../src/core/public';
import { TimeRange } from '../../common/types/service_types';
import { TimeRange as ServiceDetailsTimeRange } from '../../common/types/service_details_types';
import { AGENT_TRACES_APP_ID, EXPLORE_APP_ID } from '../../common/constants';
import {
  observabilityApmApplicationMapID,
  observabilityApmServicesID,
  observabilityApmSloID,
} from '../../../../../common/constants/apm';
import { coreRefs } from '../../../../framework/core_refs';
import { buildSuggestSearch } from '../../pages/slos/slo_suggest_scope';
import { isDependencyType, normalizeNodeType } from './platform_utils';

/**
 * Serialize a single datemath time value (from/to) for a hand-built rison `_g`
 * on a URL hash. Two hazards, both verified against rison-node + the OSD read
 * path (URL-decode → rison-decode → datemath):
 *  1) rison parse: a value starting with `-`/a digit, or containing a rison
 *     structural char (the `:` in an absolute ISO timestamp), must be rison
 *     single-quoted or rison treats `:` as a delimiter and drops `_g` entirely.
 *     Relative values like `now` / `now-1h` stay bare.
 *  2) URL decode runs BEFORE rison on read and turns a literal `+` into a space
 *     (`now+1h` → "now 1h", which datemath rejects → blank time). encodeURIComponent
 *     makes it `%2B`, which the read path decodes back to `+`.
 * So: rison-string-encode, THEN encodeURIComponent — mirrors OSD's canonical
 * rison→URL write path (encodeURIComponent is a stricter superset: it also
 * percent-encodes `:`/`/`, which the read path decodes back before rison, so
 * every value round-trips).
 */
const RISON_NOT_IDCHAR = " '!:(),*@$";
function encodeTimeRangeValueForG(value: string): string {
  let bare = value !== '' && '-0123456789'.indexOf(value[0]) === -1;
  if (bare) {
    for (const ch of value) {
      if (RISON_NOT_IDCHAR.indexOf(ch) !== -1) {
        bare = false;
        break;
      }
    }
  }
  const risonValue = bare ? value : `'${escapeRisonString(value)}'`;
  return encodeURIComponent(risonValue);
}

/**
 * Escape a value for embedding inside a rison single-quoted string. Rison treats
 * `!` as its escape char and `'` as the string terminator, so both must be
 * escaped (`!`→`!!` FIRST, then `'`→`!'`) or the surrounding rison is corrupted
 * and the OSD read path silently drops the enclosing object.
 */
function escapeRisonString(value: string): string {
  return value.replace(/!/g, '!!').replace(/'/g, "!'");
}

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
  /** Node type (service / database / messaging / external) — routes dependencies to a tailored view */
  nodeType?: string;
}

/**
 * Opens the Explore "metrics" flavor (Discover metrics) in a new tab, pre-loaded
 * with a PromQL query against the given Prometheus data connection and time range.
 *
 * Mirrors navigateToExploreTraces/navigateToExploreLogs: the _g/_q/_a rison is
 * hand-built on the hash (no rison lib — the OSS Code-Diff-Analyzer blocks new
 * deps). Contract (src/plugins/explore/.../utils/state_management/utils/redux_persistence.ts):
 *  - dataset.id === the Prometheus data-connection `connectionId` (what APM stores
 *    as config.prometheusDataSource.name / the prometheusConnectionId prop);
 *  - `signalType:metrics` is mandatory or the dataset is discarded by the flavor;
 *  - `ui.metricsPageMode:query` opens the query/visualization view.
 */
export function navigateToExploreMetrics(
  promqlQuery: string,
  connectionId: string,
  timeRange: ServiceDetailsTimeRange
): void {
  const g = `_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${encodeTimeRangeValueForG(
    timeRange.from
  )},to:${encodeTimeRangeValueForG(timeRange.to)}))`;
  // connectionId lands inside rison single-quoted strings; a connection whose id
  // contains `'`/`!` would corrupt the rison and Explore would drop the dataset,
  // opening with no data source — so rison-escape it exactly like the query, then
  // URL-encode so a space/&/#/% in the id can't break the hash.
  const safeConnectionId = encodeURIComponent(escapeRisonString(connectionId));
  const dataset = `dataset:(id:'${safeConnectionId}',title:'${safeConnectionId}',type:PROMETHEUS,language:PROMQL,timeFieldName:Time,signalType:metrics,dataSource:(meta:()))`;
  // The query lives inside a rison single-quoted string. Rison treats `!` and `'`
  // as special (escape + string terminator), and encodeURIComponent leaves both
  // raw — so a PromQL matcher like `remoteService!=""` would corrupt the rison and
  // Explore drops the query. Collapse whitespace (multi-line PromQL), rison-escape
  // (order matters, handled by escapeRisonString), and finally URL-encode for the hash.
  const risonSafeQuery = escapeRisonString(promqlQuery.replace(/\s+/g, ' ').trim());
  const q = `_q=(${dataset},language:PROMQL,query:'${encodeURIComponent(risonSafeQuery)}')`;
  const a = `_a=(ui:(metricsPageMode:query),tab:(),legacy:())`;
  const path = `metrics/#?${g}&${q}&${a}`;

  const fullUrl =
    coreRefs.http?.basePath.prepend(`/app/${EXPLORE_APP_ID}/${path}`) ||
    `/app/${EXPLORE_APP_ID}/${path}`;
  window.open(fullUrl, '_blank');
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

  // Add the node type for dependencies so the detail route renders the dependency view;
  // service links stay as before.
  if (isDependencyType(options?.nodeType)) {
    params.set('nodeType', normalizeNodeType(options?.nodeType));
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
 * Opens service details page in a new browser tab.
 * Uses basePath.prepend for workspace-aware URL construction.
 */
export function openServiceDetailsInNewTab(
  serviceName: string,
  environment?: string,
  options?: NavigateToServiceDetailsOptions
): void {
  const encodedServiceName = encodeURIComponent(serviceName);
  const encodedEnvironment = encodeURIComponent(environment || 'generic:default');

  const params = new URLSearchParams();
  if (options?.tab) params.set('tab', options.tab);
  if (options?.timeRange) {
    params.set('from', options.timeRange.from);
    params.set('to', options.timeRange.to);
  }
  if (options?.language) params.set('lang', options.language);
  if (isDependencyType(options?.nodeType)) {
    params.set('nodeType', normalizeNodeType(options?.nodeType));
  }

  const queryString = params.toString();
  const hash = `#/service-details/${encodedServiceName}/${encodedEnvironment}${
    queryString ? `?${queryString}` : ''
  }`;

  const fullUrl =
    coreRefs.http?.basePath.prepend(`/app/${observabilityApmServicesID}/${hash}`) ||
    `/app/${observabilityApmServicesID}/${hash}`;

  window.open(fullUrl, '_blank', 'noopener,noreferrer');
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
 * Navigates to the SLO suggest page scoped to the given services.
 * `#/slos/suggest?source=apm&services=<csv>[&from=<time>&to=<time>]` inside the
 * apm-slo app — we cross a HashRouter boundary, so go through
 * `application.navigateToApp`.
 *
 * The optional `timeRange` carries the range the user was viewing on the
 * launching page so discovery reflects the same window; the suggest page falls
 * back to its default when it's omitted.
 */
export function navigateToSloSuggest(services: string[], timeRange?: TimeRange): void {
  const path = `#/slos/suggest?${buildSuggestSearch(services, timeRange)}`;
  coreRefs?.application?.navigateToApp(observabilityApmSloID, { path });
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Navigates to the SLO listing filtered to the given services.
 * `#/slos?service=<csv>` inside the apm-slo app. Omit the `service` param
 * when the service list is empty so the listing shows the full datasource.
 */
export function navigateToSloListing(services: string[]): void {
  const path =
    services.length > 0 ? `#/slos?service=${encodeURIComponent(services.join(','))}` : '#/slos';
  coreRefs?.application?.navigateToApp(observabilityApmSloID, { path });
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
  const path = `traces/#?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${encodeTimeRangeValueForG(
    timeRange.from
  )},to:${encodeTimeRangeValueForG(timeRange.to)}))&_q=(dataset:(dataSource:(id:'${
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

/** Escape a value for a PPL double-quoted string literal. */
function escapePplString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Agent Traces tab to open: the trace list or the span list. */
export type AgentTracesTab = 'traces' | 'spans';

/**
 * Opens Agent Traces in a new tab with a PPL filter, the given time range and the APM
 * traces dataset. Agent Traces understands GenAI spans (agent, LLM and tool views,
 * sessions), so APM sends GenAI correlations there instead of Explore traces.
 */
function openAgentTraces(
  tab: AgentTracesTab,
  pplQuery: string,
  timeRange: TimeRange,
  datasetId: string,
  datasetTitle: string,
  dataSourceId?: string,
  dataSourceTitle?: string
): void {
  const dsTitle = dataSourceTitle ? `'${escapeRisonString(dataSourceTitle)}'` : "''";
  const path = `${tab}#?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${encodeTimeRangeValueForG(
    timeRange.from
  )},to:${encodeTimeRangeValueForG(timeRange.to)}))&_q=(dataset:(dataSource:(id:'${encodeURIComponent(
    escapeRisonString(dataSourceId || '')
  )}',title:${dsTitle},type:OpenSearch),id:'${encodeURIComponent(
    escapeRisonString(datasetId)
  )}',signalType:traces,timeFieldName:startTime,title:'${encodeURIComponent(
    escapeRisonString(datasetTitle)
  )}',type:INDEX_PATTERN),language:PPL,query:'${encodeURIComponent(
    escapeRisonString(pplQuery)
  )}')&_a=(ui:(activeTabId:${tab},showHistogram:!t))`;

  const fullUrl =
    coreRefs.http?.basePath.prepend(`/app/${AGENT_TRACES_APP_ID}/${path}`) ||
    `/app/${AGENT_TRACES_APP_ID}/${path}`;
  window.open(fullUrl, '_blank');
}

/**
 * Opens a service's spans in Agent Traces (the counterpart of navigateToExploreTraces for
 * GenAI services), filtered to the service and optional operation. Uses the Spans tab: the
 * Traces tab lists traces by their root span, and a GenAI service behind a plain HTTP
 * server span (no gen_ai attributes on the root) would not appear there.
 */
export function navigateToAgentTraces(
  datasetId: string,
  datasetTitle: string,
  serviceName: string,
  timeRange: TimeRange,
  dataSourceId?: string,
  dataSourceTitle?: string,
  operationFilter?: string
): void {
  let pplQuery = `| where serviceName = "${escapePplString(serviceName)}"`;
  if (operationFilter) {
    pplQuery += ` | where name = "${escapePplString(operationFilter)}"`;
  }
  openAgentTraces(
    'spans',
    pplQuery,
    timeRange,
    datasetId,
    datasetTitle,
    dataSourceId,
    dataSourceTitle
  );
}

/**
 * Opens the trace of a GenAI span in Agent Traces (the counterpart of navigateToSpanDetails).
 * Agent Traces has no span deep link yet, so it lists the trace's GenAI spans (Spans tab, see
 * navigateToAgentTraces); one click opens the trace tree.
 */
export function navigateToAgentTraceDetails(
  datasetId: string,
  datasetTitle: string,
  traceId: string,
  timeRange: TimeRange,
  dataSourceId?: string,
  dataSourceTitle?: string
): void {
  openAgentTraces(
    'spans',
    `| where traceId = "${escapePplString(traceId)}"`,
    timeRange,
    datasetId,
    datasetTitle,
    dataSourceId,
    dataSourceTitle
  );
}

/** Workspace use cases Agent Traces opens in; elsewhere it redirects to Discover. */
const AGENT_TRACES_WORKSPACE_FEATURES = ['use-case-observability', 'use-case-all'];

/**
 * Calls back with whether links can open Agent Traces: the app is registered and accessible,
 * enabled (`explore.agentTraces.enabled`, which drives its capability and nav link), and the
 * current workspace has the observability or all use case (Agent Traces redirects to Discover
 * elsewhere, including when workspaces are off). Returns an unsubscribe function.
 */
export function subscribeAgentTracesAvailable(callback: (available: boolean) => void): () => void {
  const apps$ = coreRefs.application?.applications$;
  if (!apps$) {
    callback(false);
    return () => {};
  }
  const workspace$ = coreRefs.workspaces?.currentWorkspace$ ?? of(null);
  const subscription = combineLatest([apps$, workspace$]).subscribe(([apps, workspace]) => {
    const app = apps.get(AGENT_TRACES_APP_ID);
    const capabilities = coreRefs.application?.capabilities as
      { agentTraces?: { agentTracesEnabled?: boolean } } | undefined;
    const features = workspace?.features ?? [];
    callback(
      !!app &&
        app.status === AppStatus.accessible &&
        app.navLinkStatus !== AppNavLinkStatus.hidden &&
        capabilities?.agentTraces?.agentTracesEnabled === true &&
        AGENT_TRACES_WORKSPACE_FEATURES.some((feature) => features.includes(feature))
    );
  });
  return () => subscription.unsubscribe();
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

  const path = `logs/#?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${encodeTimeRangeValueForG(
    timeRange.from
  )},to:${encodeTimeRangeValueForG(timeRange.to)}))&_q=(dataset:(dataSource:(id:'${
    dataSourceId || ''
  }',title:${dsTitle},type:OpenSearch),id:'${datasetId}',timeFieldName:time,title:'${datasetTitle}',type:INDEX_PATTERN),language:PPL,query:'${encodeURIComponent(
    pplQuery
  )}')&_a=(legacy:(interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))`;

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
  window.location.assign(fullUrl);
}

/**
 * Correlated dashboards (optional, experimental).
 *
 * Opens a saved dashboard in the Dashboards app in a NEW browser tab, carrying
 * the current APM time range via the global (_g) state. v0 passes the time
 * range only (no per-service filter).
 *
 * The destination is always same-origin: the path is a fixed `/app/dashboards`
 * route run through `basePath.prepend` (which prepends the OSD server base /
 * workspace), so the host can never be influenced by the arguments. The `_g`
 * rison is hand-built to match the existing trace/log deep links above, and the
 * dashboard id is percent-encoded. `timeRange` comes from the internal APM
 * time-picker state, not from raw URL input.
 */
export function openCorrelatedDashboard(dashboardId: string, timeRange?: TimeRange): void {
  const query = timeRange
    ? `?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:${encodeTimeRangeValueForG(
        timeRange.from
      )},to:${encodeTimeRangeValueForG(timeRange.to)}))`
    : '';
  const path = `/app/dashboards#/view/${encodeURIComponent(dashboardId)}${query}`;
  const url = coreRefs.http?.basePath.prepend(path) || path;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Opens the APM settings modal by setting the `_apmSettings` URL marker that the
 * APM pages listen for (useOpenOnUrlMarker). Preserves the current route/query.
 *
 * Existing query params are preserved VERBATIM (not rebuilt via
 * URLSearchParams.toString()) so rison `_g`/`_a` values are not percent-encoded
 * / churned — same care useOpenOnUrlMarker takes when it strips the marker. The
 * path defaults to `/` when the hash is empty so we never emit `#?...`. A
 * `hashchange` event is dispatched explicitly (matching navigateToSloSuggest)
 * because assigning the same hash value does not fire one on its own; re-entry
 * is safe since the hook removes the marker on open.
 *
 * When `focusCorrelatedDashboards` is set (the empty-state CTA), a
 * `_apmSettingsFocus=correlatedDashboards` hint is added so the settings modal
 * scrolls the correlated-dashboards picker into view on open.
 */
export const APM_SETTINGS_FOCUS_MARKER = '_apmSettingsFocus';

export function openApmSettings(focusCorrelatedDashboards = false): void {
  const hash = window.location.hash.replace(/^#/, ''); // e.g. "/services?tab=overview"
  const qIndex = hash.indexOf('?');
  const path = (qIndex === -1 ? hash : hash.slice(0, qIndex)) || '/';
  const rawQuery = qIndex === -1 ? '' : hash.slice(qIndex + 1);
  const pairs = rawQuery
    ? rawQuery
        .split('&')
        .filter(
          (pair) =>
            pair.split('=')[0] !== '_apmSettings' &&
            pair.split('=')[0] !== APM_SETTINGS_FOCUS_MARKER
        )
    : [];
  if (focusCorrelatedDashboards) {
    pairs.push(`${APM_SETTINGS_FOCUS_MARKER}=correlatedDashboards`);
  }
  pairs.push('_apmSettings=true');
  window.location.hash = `#${path}?${pairs.join('&')}`;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Whether a hash path (`#/service-details/{name}/{environment}`, without the query) is the
 * details page of this service or dependency. The `default` environment segment stands for
 * no environment, as in services.tsx.
 */
export function isServiceDetailsHashPath(
  hashPath: string,
  serviceName: string,
  environment?: string
): boolean {
  const match = /^#\/service-details\/([^/]+)\/([^/]+)\/?$/.exec(hashPath);
  if (!match) return false;
  try {
    const pathService = decodeURIComponent(match[1]);
    const pathEnvironment = decodeURIComponent(match[2]);
    return (
      pathService === serviceName &&
      (pathEnvironment === 'default' ? '' : pathEnvironment) === (environment || '')
    );
  } catch {
    return false;
  }
}
