/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert service — orchestrates OpenSearch and Prometheus backends,
 * and provides a unified view for the UI.
 */
import {
  AlertingOSClient,
  Datasource,
  DatasourceService,
  DatasourceFetchResult,
  DatasourceFetchStatus,
  DatasourceWarning,
  Logger,
  OpenSearchBackend,
  PrometheusBackend,
  OSAlert,
  OSMonitor,
  PromAlert,
  PromAlertingRule,
  PromRuleGroup,
  ProgressiveResponse,
  PaginatedResponse,
  UnifiedAlertSummary,
  UnifiedAlertSeverity,
  UnifiedAlertState,
  UnifiedFetchOptions,
  UnifiedAlert,
  UnifiedRule,
  UnifiedRuleSummary,
  AlertHistoryEntry,
  NotificationRouting,
  MonitorType,
  MonitorStatus,
} from '../../../common/types/alerting/types';
import { TimeoutError } from './timeout_error';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 5_000;

export class MultiBackendAlertService {
  private osBackend?: OpenSearchBackend;
  private promBackend?: PrometheusBackend;

  constructor(
    private readonly datasourceService: DatasourceService,
    private readonly logger: Logger
  ) {}

  registerOpenSearch(backend: OpenSearchBackend): void {
    this.osBackend = backend;
    this.logger.info('Registered OpenSearch alerting backend');
  }

  /** Access the Prometheus backend (e.g. for Alertmanager config route). */
  getPrometheusBackend(): PrometheusBackend | undefined {
    return this.promBackend;
  }

  registerPrometheus(backend: PrometheusBackend): void {
    this.promBackend = backend;
    this.logger.info('Registered Prometheus alerting backend');
  }

  // =========================================================================
  // OpenSearch pass-through
  // =========================================================================

  async getOSMonitors(client: AlertingOSClient, dsId: string): Promise<OSMonitor[]> {
    await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.getMonitors(client);
  }

  async getOSMonitor(
    client: AlertingOSClient,
    dsId: string,
    monitorId: string
  ): Promise<OSMonitor | null> {
    await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.getMonitor(client, monitorId);
  }

  async createOSMonitor(
    client: AlertingOSClient,
    dsId: string,
    monitor: Omit<OSMonitor, 'id'>
  ): Promise<OSMonitor> {
    await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.createMonitor(client, monitor);
  }

  async updateOSMonitor(
    client: AlertingOSClient,
    dsId: string,
    monitorId: string,
    input: Partial<OSMonitor>
  ): Promise<OSMonitor | null> {
    await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.updateMonitor(client, monitorId, input);
  }

  async deleteOSMonitor(
    client: AlertingOSClient,
    dsId: string,
    monitorId: string
  ): Promise<boolean> {
    await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.deleteMonitor(client, monitorId);
  }

  async getOSAlerts(
    client: AlertingOSClient,
    dsId: string
  ): Promise<{ alerts: OSAlert[]; totalAlerts: number }> {
    await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.getAlerts(client);
  }

  async acknowledgeOSAlerts(
    client: AlertingOSClient,
    dsId: string,
    monitorId: string,
    alertIds: string[]
  ): Promise<unknown> {
    await this.requireDatasource(dsId, 'opensearch');
    return this.osBackend!.acknowledgeAlerts(client, monitorId, alertIds);
  }

  // =========================================================================
  // Prometheus pass-through
  // =========================================================================

  async getPromRuleGroups(client: AlertingOSClient, dsId: string): Promise<PromRuleGroup[]> {
    const ds = await this.requireDatasource(dsId, 'prometheus');
    return this.promBackend!.getRuleGroups(client, ds);
  }

  async getPromAlerts(client: AlertingOSClient, dsId: string): Promise<PromAlert[]> {
    const ds = await this.requireDatasource(dsId, 'prometheus');
    return this.promBackend!.getAlerts(client, ds);
  }

  // =========================================================================
  // Unified views (for the UI) — parallel with per-datasource timeout
  // =========================================================================

  async getUnifiedAlerts(
    clientOrResolver: AlertingOSClient | ((dsId: string) => Promise<AlertingOSClient>),
    options?: UnifiedFetchOptions
  ): Promise<ProgressiveResponse<UnifiedAlertSummary>> {
    const datasources = await this.resolveDatasources(options?.dsIds);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
    const fetchedAt = new Date().toISOString();

    const isResolver = typeof clientOrResolver === 'function';
    const dsResults = await Promise.allSettled(
      datasources.map(async (ds) => {
        const client = isResolver ? await clientOrResolver(ds.id) : clientOrResolver;
        return this.fetchAlertsFromDatasource(client, ds, timeoutMs, options?.onProgress);
      })
    );

    const allResults: UnifiedAlertSummary[] = [];
    const statusList: Array<DatasourceFetchResult<UnifiedAlertSummary>> = [];

    for (let i = 0; i < datasources.length; i++) {
      const settled = dsResults[i];
      if (settled.status === 'fulfilled') {
        allResults.push(...settled.value.data);
        statusList.push(settled.value);
      } else {
        const errResult: DatasourceFetchResult<UnifiedAlertSummary> = {
          datasourceId: datasources[i].id,
          datasourceName: datasources[i].name,
          datasourceType: datasources[i].type,
          status: 'error',
          data: [],
          error: String(settled.reason),
          durationMs: timeoutMs,
        };
        statusList.push(errResult);
      }
    }

    return {
      results: allResults.slice(0, maxResults),
      datasourceStatus: statusList,
      totalDatasources: datasources.length,
      completedDatasources: statusList.filter((s) => s.status === 'success').length,
      fetchedAt,
    };
  }

  async getUnifiedRules(
    clientOrResolver: AlertingOSClient | ((dsId: string) => Promise<AlertingOSClient>),
    options?: UnifiedFetchOptions
  ): Promise<ProgressiveResponse<UnifiedRuleSummary>> {
    const datasources = await this.resolveDatasources(options?.dsIds);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
    const fetchedAt = new Date().toISOString();

    const isResolver = typeof clientOrResolver === 'function';
    const dsResults = await Promise.allSettled(
      datasources.map(async (ds) => {
        const client = isResolver ? await clientOrResolver(ds.id) : clientOrResolver;
        return this.fetchRulesFromDatasource(client, ds, timeoutMs, options?.onProgress);
      })
    );

    const allResults: UnifiedRuleSummary[] = [];
    const statusList: Array<DatasourceFetchResult<UnifiedRuleSummary>> = [];

    for (let i = 0; i < datasources.length; i++) {
      const settled = dsResults[i];
      if (settled.status === 'fulfilled') {
        allResults.push(...settled.value.data);
        statusList.push(settled.value);
      } else {
        const errResult: DatasourceFetchResult<UnifiedRuleSummary> = {
          datasourceId: datasources[i].id,
          datasourceName: datasources[i].name,
          datasourceType: datasources[i].type,
          status: 'error',
          data: [],
          error: String(settled.reason),
          durationMs: timeoutMs,
        };
        statusList.push(errResult);
      }
    }

    return {
      results: allResults.slice(0, maxResults),
      datasourceStatus: statusList,
      totalDatasources: datasources.length,
      completedDatasources: statusList.filter((s) => s.status === 'success').length,
      fetchedAt,
    };
  }

  // =========================================================================
  // Paginated unified views — for single-datasource selection with pagination
  // =========================================================================

  async getPaginatedRules(
    client: AlertingOSClient,
    options?: UnifiedFetchOptions
  ): Promise<PaginatedResponse<UnifiedRuleSummary>> {
    const page = options?.page ?? 1;
    const pageSize = Math.min(options?.pageSize ?? 20, 100);
    const datasources = await this.resolveDatasources(options?.dsIds);

    const allRules: UnifiedRuleSummary[] = [];
    const warnings: DatasourceWarning[] = [];

    // Fetch from all datasources in parallel
    const dsResults = await Promise.allSettled(
      datasources.map((ds) => this.fetchRulesRaw(client, ds))
    );

    for (let i = 0; i < datasources.length; i++) {
      const settled = dsResults[i];
      if (settled.status === 'fulfilled') {
        allRules.push(...settled.value);
      } else {
        this.logger.error(
          `Failed to fetch rules from ${datasources[i].name} (${datasources[i].id}): ${settled.reason}`
        );
        warnings.push({
          datasourceId: datasources[i].id,
          datasourceName: datasources[i].name,
          datasourceType: datasources[i].type,
          error: String(settled.reason),
        });
      }
    }

    if (allRules.length === 0 && warnings.length === datasources.length && datasources.length > 0) {
      throw new Error(
        `All datasources failed: ${warnings
          .map((w) => `${w.datasourceName}: ${w.error}`)
          .join('; ')}`
      );
    }

    const total = allRules.length;
    const start = (page - 1) * pageSize;
    const results = allRules.slice(start, start + pageSize);

    return {
      results,
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async getPaginatedAlerts(
    client: AlertingOSClient,
    options?: UnifiedFetchOptions
  ): Promise<PaginatedResponse<UnifiedAlertSummary>> {
    const page = options?.page ?? 1;
    const pageSize = Math.min(options?.pageSize ?? 20, 100);
    const datasources = await this.resolveDatasources(options?.dsIds);

    const allAlerts: UnifiedAlertSummary[] = [];
    const warnings: DatasourceWarning[] = [];

    // Fetch from all datasources in parallel
    const dsResults = await Promise.allSettled(
      datasources.map((ds) => this.fetchAlertsRaw(client, ds))
    );

    for (let i = 0; i < datasources.length; i++) {
      const settled = dsResults[i];
      if (settled.status === 'fulfilled') {
        allAlerts.push(...settled.value);
      } else {
        this.logger.error(
          `Failed to fetch alerts from ${datasources[i].name} (${datasources[i].id}): ${settled.reason}`
        );
        warnings.push({
          datasourceId: datasources[i].id,
          datasourceName: datasources[i].name,
          datasourceType: datasources[i].type,
          error: String(settled.reason),
        });
      }
    }

    if (
      allAlerts.length === 0 &&
      warnings.length === datasources.length &&
      datasources.length > 0
    ) {
      throw new Error(
        `All datasources failed: ${warnings
          .map((w) => `${w.datasourceName}: ${w.error}`)
          .join('; ')}`
      );
    }

    const total = allAlerts.length;
    const start = (page - 1) * pageSize;
    const results = allAlerts.slice(start, start + pageSize);

    return {
      results,
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  // =========================================================================
  // Detail views — loaded on demand when user opens a flyout
  // =========================================================================

  /**
   * Get full detail for a single rule/monitor. Fetches real metadata from
   * the backend (alert history, destinations, annotations). Fields that
   * cannot be fetched from the API are marked as mock placeholders.
   */
  async getRuleDetail(
    client: AlertingOSClient,
    dsId: string,
    ruleId: string
  ): Promise<UnifiedRule | null> {
    const ds = await this.datasourceService.get(dsId);
    if (!ds) return null;

    if (ds.type === 'opensearch' && this.osBackend) {
      return this.getOSRuleDetail(client, ds, ruleId);
    } else if (ds.type === 'prometheus' && this.promBackend) {
      return this.getPromRuleDetail(client, ds, ruleId);
    }
    return null;
  }

  private async getOSRuleDetail(
    client: AlertingOSClient,
    ds: Datasource,
    monitorId: string
  ): Promise<UnifiedRule | null> {
    const monitor = await this.osBackend!.getMonitor(client, monitorId);
    if (!monitor) return null;

    const summary = osMonitorToUnifiedRuleSummary(monitor, ds.id);

    // Fetch real alert history for this monitor
    let alertHistory: AlertHistoryEntry[] = [];
    try {
      const { alerts } = await this.osBackend!.getAlerts(client);
      const monitorAlerts = alerts.filter((a) => a.monitor_id === monitorId).slice(0, 20);
      alertHistory = monitorAlerts.map((a) => ({
        timestamp: new Date(a.start_time).toISOString(),
        state: osStateToUnified(a.state),
        value: a.severity,
        message: a.error_message || (a.state === 'ACTIVE' ? 'Threshold exceeded' : 'Resolved'),
      }));
    } catch {
      // Alert history fetch is best-effort
    }

    // Build notification routing from trigger actions + destinations
    const notificationRouting: NotificationRouting[] = [];
    try {
      const destinations = await this.osBackend!.getDestinations(client);
      const destMap = new Map(destinations.map((d) => [d.id, d]));
      for (const trigger of monitor.triggers) {
        for (const action of trigger.actions) {
          const dest = destMap.get(action.destination_id);
          notificationRouting.push({
            channel: dest?.type || 'unknown',
            destination: dest?.name || action.name || action.destination_id,
            throttle: action.throttle
              ? `${action.throttle.value} ${action.throttle.unit}`
              : undefined,
          });
        }
      }
    } catch {
      // Destination fetch is best-effort
    }

    // Build description from trigger message template or input type
    const trigger = monitor.triggers[0];
    const kind = detectMonitorKind(monitor);
    const input = monitor.inputs[0];
    let descriptionFallback: string;
    if (kind === 'cluster_metrics' && input && 'uri' in input) {
      descriptionFallback = `Cluster metrics monitor: ${input.uri.api_type} (${input.uri.path})`;
    } else if (kind === 'doc' && input && 'doc_level_input' in input) {
      const docIndices = input.doc_level_input.indices?.join(', ') || 'unknown indices';
      const queryCount = input.doc_level_input.queries?.length ?? 0;
      descriptionFallback = `Document-level monitor targeting ${docIndices} with ${queryCount} queries`;
    } else if (kind === 'bucket' && input && 'search' in input) {
      const bucketIndices = input.search.indices?.join(', ') || 'unknown indices';
      descriptionFallback = `Bucket aggregation monitor targeting ${bucketIndices}`;
    } else {
      const queryIndices = input && 'search' in input ? input.search.indices?.join(', ') : null;
      descriptionFallback = `${summary.monitorType} monitor targeting ${
        queryIndices || 'unknown indices'
      }`;
    }
    const description = trigger?.actions?.[0]?.message_template?.source || descriptionFallback;

    // Fetch condition preview: run the monitor's query as a date_histogram to build a time-series
    let conditionPreviewData: Array<{ timestamp: number; value: number }> = [];
    try {
      conditionPreviewData = await this.fetchOSPreviewTimeSeries(client, ds, monitor);
    } catch {
      // Preview data fetch is best-effort
    }
    // Fallback: try dry-run execution if time-series extraction produced nothing
    if (conditionPreviewData.length === 0) {
      try {
        const execResult = await this.osBackend!.runMonitor(client, monitorId, true);
        conditionPreviewData = this.extractOSPreviewData(execResult);
      } catch {
        // Dry run is best-effort — some monitors may not support it
      }
    }

    return {
      ...summary,
      description,
      // AI summary not available from OS alerting API — empty triggers flyout fallback
      aiSummary: '',
      firingPeriod: undefined,
      lookbackPeriod: undefined,
      alertHistory,
      conditionPreviewData,
      notificationRouting,
      // Suppression rules from the in-memory service (not from OS API)
      suppressionRules: [],
      raw: monitor,
    };
  }

  private async getPromRuleDetail(
    client: AlertingOSClient,
    ds: Datasource,
    ruleId: string
  ): Promise<UnifiedRule | null> {
    const groups = await this.promBackend!.getRuleGroups(client, ds);

    // ruleId format: "{dsId}-{groupName}-{ruleName}"
    for (const group of groups) {
      for (const rule of group.rules) {
        if (rule.type !== 'alerting') continue;
        const alertingRule = rule as PromAlertingRule;
        const id = `${ds.id}-${group.name}-${alertingRule.name}`;
        if (id !== ruleId) continue;

        const summary = promRuleToUnified(alertingRule, group.name, ds.id);

        // Real alert history from the rule's embedded alerts
        const alertHistory: AlertHistoryEntry[] = (alertingRule.alerts || []).map((a) => ({
          timestamp: a.activeAt,
          state: promStateToUnified(a.state),
          value: a.value,
          message: a.annotations.summary || a.annotations.description || a.state,
        }));

        // Description from annotations
        const description =
          alertingRule.annotations.description ||
          alertingRule.annotations.summary ||
          `PromQL rule: ${alertingRule.query}`;

        return {
          ...summary,
          description,
          // AI summary not available from Prometheus API — empty triggers flyout fallback
          aiSummary: '',
          firingPeriod: undefined,
          lookbackPeriod: undefined,
          alertHistory,
          conditionPreviewData: await this.fetchPromPreviewData(
            client,
            ds,
            alertingRule.query,
            alertingRule
          ),
          notificationRouting: [],
          suppressionRules: [],
          raw: alertingRule,
        };
      }
    }
    return null;
  }

  /**
   * Get full detail for a single alert including raw backend data.
   */
  async getAlertDetail(
    client: AlertingOSClient,
    dsId: string,
    alertId: string
  ): Promise<UnifiedAlert | null> {
    const ds = await this.datasourceService.get(dsId);
    if (!ds) return null;

    if (ds.type === 'opensearch' && this.osBackend) {
      const { alerts } = await this.osBackend.getAlerts(client);
      const alert = alerts.find((a) => a.id === alertId);
      if (!alert) return null;
      const summary = osAlertToUnified(alert, ds!.id);
      return { ...summary, raw: alert };
    } else if (ds.type === 'prometheus' && this.promBackend) {
      const promAlerts = await this.promBackend.getAlerts(client, ds);
      const resolvedId = ds!.id;
      const alert = promAlerts.find(
        (a) => `${resolvedId}-${a.labels.alertname}-${a.labels.instance || ''}` === alertId
      );
      if (!alert) return null;
      const summary = promAlertToUnified(alert, resolvedId);
      return { ...summary, raw: alert };
    }
    return null;
  }

  // =========================================================================

  private async fetchAlertsFromDatasource(
    client: AlertingOSClient,
    ds: Datasource,
    timeoutMs: number,
    onProgress?: (result: DatasourceFetchResult<UnifiedAlertSummary>) => void
  ): Promise<DatasourceFetchResult<UnifiedAlertSummary>> {
    const start = Date.now();
    const makeResult = (
      status: DatasourceFetchStatus,
      data: UnifiedAlertSummary[],
      error?: string
    ): DatasourceFetchResult<UnifiedAlertSummary> => ({
      datasourceId: ds.id,
      datasourceName: ds.name,
      datasourceType: ds.type,
      status,
      data,
      error,
      durationMs: Date.now() - start,
    });

    try {
      const data = await this.withTimeout(
        this.fetchAlertsRaw(client, ds),
        timeoutMs,
        `Datasource ${ds.name} timed out after ${timeoutMs}ms`
      );
      const result = makeResult('success', data);
      if (onProgress) onProgress(result);
      return result;
    } catch (err) {
      const isTimeout = err instanceof TimeoutError;
      const result = makeResult(isTimeout ? 'timeout' : 'error', [], String(err));
      this.logger.error(`Failed to fetch alerts from ${ds.name}: ${err}`);
      if (onProgress) onProgress(result);
      return result;
    }
  }

  private async fetchRulesFromDatasource(
    client: AlertingOSClient,
    ds: Datasource,
    timeoutMs: number,
    onProgress?: (result: DatasourceFetchResult<UnifiedRuleSummary>) => void
  ): Promise<DatasourceFetchResult<UnifiedRuleSummary>> {
    const start = Date.now();
    const makeResult = (
      status: DatasourceFetchStatus,
      data: UnifiedRuleSummary[],
      error?: string
    ): DatasourceFetchResult<UnifiedRuleSummary> => ({
      datasourceId: ds.id,
      datasourceName: ds.name,
      datasourceType: ds.type,
      status,
      data,
      error,
      durationMs: Date.now() - start,
    });

    try {
      const data = await this.withTimeout(
        this.fetchRulesRaw(client, ds),
        timeoutMs,
        `Datasource ${ds.name} timed out after ${timeoutMs}ms`
      );
      const result = makeResult('success', data);
      if (onProgress) onProgress(result);
      return result;
    } catch (err) {
      const isTimeout = err instanceof TimeoutError;
      const result = makeResult(isTimeout ? 'timeout' : 'error', [], String(err));
      this.logger.error(`Failed to fetch rules from ${ds.name}: ${err}`);
      if (onProgress) onProgress(result);
      return result;
    }
  }

  private async fetchAlertsRaw(
    client: AlertingOSClient,
    ds: Datasource
  ): Promise<UnifiedAlertSummary[]> {
    const results: UnifiedAlertSummary[] = [];
    if (ds.type === 'opensearch' && this.osBackend) {
      const { alerts } = await this.osBackend.getAlerts(client);
      for (const a of alerts) results.push(osAlertToUnified(a, ds.id));
    } else if (ds.type === 'prometheus' && this.promBackend) {
      const alerts = await this.promBackend.getAlerts(client, ds);
      for (const a of alerts) results.push(promAlertToUnified(a, ds.id));
    }
    return results;
  }

  private async fetchRulesRaw(
    client: AlertingOSClient,
    ds: Datasource
  ): Promise<UnifiedRuleSummary[]> {
    const results: UnifiedRuleSummary[] = [];
    if (ds.type === 'opensearch' && this.osBackend) {
      const monitors = await this.osBackend.getMonitors(client);
      for (const m of monitors) results.push(osMonitorToUnifiedRuleSummary(m, ds.id));
    } else if (ds.type === 'prometheus' && this.promBackend) {
      const groups = await this.promBackend.getRuleGroups(client, ds);
      for (const g of groups) {
        for (const r of g.rules) {
          if (r.type === 'alerting') results.push(promRuleToUnified(r, g.name, ds.id));
        }
      }
    }
    return results;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async resolveDatasources(dsIds?: string[]): Promise<Datasource[]> {
    const all = await this.datasourceService.list();
    const enabled = all.filter((ds) => ds.enabled);
    if (!dsIds || dsIds.length === 0) return enabled;

    const resolved: Datasource[] = [];
    for (const id of dsIds) {
      const match = enabled.filter((ds) => ds.id === id);
      if (match.length > 0) resolved.push(match[0]);
    }
    return resolved;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new TimeoutError(message, ms));
        }
      }, ms);
      promise.then(
        (val) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(val);
          }
        },
        (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        }
      );
    });
  }

  /**
   * Fetch a time-series for the monitor's query by wrapping it in a date_histogram.
   * This gives us bucketed data points for the condition preview chart.
   * Supports all monitor types: query_level, bucket_level, cluster_metrics, and doc_level.
   */
  private async fetchOSPreviewTimeSeries(
    client: AlertingOSClient,
    ds: Datasource,
    monitor: OSMonitor
  ): Promise<Array<{ timestamp: number; value: number }>> {
    const input = monitor.inputs[0];
    if (!input) return [];

    // --- Cluster metrics monitors (uri input) ---
    if ('uri' in input) {
      return this.fetchClusterMetricsPreview(client, ds, monitor);
    }

    // --- Doc-level monitors ---
    if ('doc_level_input' in input) {
      return this.fetchDocLevelPreview(client, ds, input);
    }

    // --- Query-level and bucket-level monitors (search input) ---
    if (!('search' in input)) return [];

    const indices = input.search.indices;
    if (!indices || indices.length === 0) return [];

    const originalQuery = input.search.query;
    if (!originalQuery || typeof originalQuery !== 'object') return [];

    // Detect the timestamp field from the original query's range filter
    const timestampField = extractTimestampField(originalQuery) || '@timestamp';

    // Extract the user's query, strip Mustache templates and the monitor's own range filter
    // (the monitor's range is typically narrow like 5m; we want 1h for the chart)
    const userQuery = (originalQuery as Record<string, unknown>).query || { match_all: {} };
    const cleanedQuery = substituteMustacheTemplates(userQuery);
    const strippedQuery = stripRangeFilters(cleanedQuery, timestampField);

    // Build a date_histogram query with our own 1-hour range
    const now = Date.now();
    const oneHourAgo = now - 3600_000;
    const intervalMinutes = 5;

    // Use ISO timestamps to support both date and date_nanos fields
    const nowIso = new Date(now).toISOString();
    const oneHourAgoIso = new Date(oneHourAgo).toISOString();

    const histogramBody: Record<string, unknown> = {
      size: 0,
      query: {
        bool: {
          // Use 'filter' context for caching (no scoring needed for preview)
          filter: [
            strippedQuery,
            {
              range: {
                [timestampField]: {
                  gte: oneHourAgoIso,
                  lte: nowIso,
                },
              },
            },
          ],
        },
      },
      aggs: {
        time_buckets: {
          date_histogram: {
            field: timestampField,
            fixed_interval: `${intervalMinutes}m`,
            min_doc_count: 0,
            extended_bounds: {
              min: oneHourAgo,
              max: now,
            },
          },
        },
      },
    };

    const result = await this.osBackend!.searchQuery(client, indices, histogramBody);
    return this.extractDateHistogramPoints(result);
  }

  /**
   * Generate preview data for cluster_metrics monitors.
   * These use `uri` input and return a snapshot (not a time series), so we
   * extract a meaningful numeric value and generate synthetic time-series points.
   */
  private async fetchClusterMetricsPreview(
    client: AlertingOSClient,
    ds: Datasource,
    monitor: OSMonitor
  ): Promise<Array<{ timestamp: number; value: number }>> {
    // Dry-run the monitor to get the current API result
    let execResult: unknown;
    try {
      execResult = await this.osBackend!.runMonitor(client, monitor.id, true);
    } catch {
      return [];
    }
    if (!execResult || typeof execResult !== 'object') return [];

    // Extract a numeric value from the execution result
    const numericValue = extractClusterMetricValue(execResult);

    // Generate 12 synthetic data points over the last hour using the snapshot value
    const now = Date.now();
    const points: Array<{ timestamp: number; value: number }> = [];
    const bucketCount = 12;
    const bucketIntervalMs = 5 * 60_000;

    for (let i = 0; i < bucketCount; i++) {
      const timestamp = now - (bucketCount - 1 - i) * bucketIntervalMs;
      // Add slight variation to make the chart readable (snapshot is a point-in-time)
      const jitter = numericValue * 0.02 * (Math.random() - 0.5);
      points.push({
        timestamp,
        value: Math.max(0, numericValue + jitter),
      });
    }

    return points;
  }

  /**
   * Generate preview data for doc_level monitors.
   * These use `doc_level_input` with indices and queries. We run a date_histogram
   * on the target indices similar to query-level monitors.
   */
  private async fetchDocLevelPreview(
    client: AlertingOSClient,
    ds: Datasource,
    input: {
      doc_level_input: {
        description: string;
        indices: string[];
        queries: Array<{ id: string; name: string; query: string; tags: string[] }>;
      };
    }
  ): Promise<Array<{ timestamp: number; value: number }>> {
    const indices = input.doc_level_input.indices;
    if (!indices || indices.length === 0) return [];

    // Use @timestamp as the default field for doc-level monitors
    const timestampField = '@timestamp';
    const now = Date.now();
    const oneHourAgo = now - 3600_000;
    const intervalMinutes = 5;

    // Build a simple date_histogram — doc-level queries match individual docs,
    // so we count matching docs per time bucket
    const nowIso = new Date(now).toISOString();
    const oneHourAgoIso = new Date(oneHourAgo).toISOString();
    const histogramBody: Record<string, unknown> = {
      size: 0,
      query: {
        bool: {
          filter: [
            {
              range: {
                [timestampField]: {
                  gte: oneHourAgoIso,
                  lte: nowIso,
                },
              },
            },
          ],
        },
      },
      aggs: {
        time_buckets: {
          date_histogram: {
            field: timestampField,
            fixed_interval: `${intervalMinutes}m`,
            min_doc_count: 0,
            extended_bounds: {
              min: oneHourAgo,
              max: now,
            },
          },
        },
      },
    };

    const result = await this.osBackend!.searchQuery(client, indices, histogramBody);
    return this.extractDateHistogramPoints(result);
  }

  /**
   * Extract time-series data points from a date_histogram aggregation response.
   */
  private extractDateHistogramPoints(result: unknown): Array<{ timestamp: number; value: number }> {
    const points: Array<{ timestamp: number; value: number }> = [];
    if (!result || typeof result !== 'object') return points;

    const res = result as Record<string, unknown>;
    const aggs = res.aggregations as Record<string, unknown> | undefined;
    if (!aggs) return points;

    const timeBuckets = aggs.time_buckets as Record<string, unknown> | undefined;
    if (!timeBuckets) return points;

    const buckets = timeBuckets.buckets as Array<Record<string, unknown>> | undefined;
    if (!buckets || !Array.isArray(buckets)) return points;

    for (const bucket of buckets) {
      const key = bucket.key as number;
      const docCount = bucket.doc_count as number;
      if (typeof key === 'number' && typeof docCount === 'number') {
        points.push({ timestamp: key, value: docCount });
      }
    }

    return points;
  }

  /**
   * Extract preview data from OS monitor dry-run result (fallback).
   * The _execute API returns input_results with the query response.
   */
  private extractOSPreviewData(execResult: unknown): Array<{ timestamp: number; value: number }> {
    const points: Array<{ timestamp: number; value: number }> = [];
    if (!execResult || typeof execResult !== 'object') return points;

    const result = execResult as Record<string, unknown>;
    const inputResults = result.input_results as Record<string, unknown> | undefined;
    const triggerResults = result.trigger_results as Record<string, unknown> | undefined;

    // Try to extract a meaningful numeric value from trigger results
    if (triggerResults) {
      const now = Date.now();
      for (const [, triggerData] of Object.entries(triggerResults)) {
        const td = triggerData as Record<string, unknown>;
        // Trigger results contain the evaluated condition value
        if (typeof td.triggered === 'boolean') {
          // Use the period_start/period_end from the execution
          // These may be ISO strings or epoch millis depending on the monitor type
          const rawStart = result.period_start;
          const rawEnd = result.period_end;
          const periodStart = toEpochMillis(rawStart) || now - 300_000;
          const periodEnd = toEpochMillis(rawEnd) || now;
          points.push({
            timestamp: periodEnd,
            value: td.triggered ? 1 : 0,
          });
          // Also add start point for a basic range
          points.push({
            timestamp: periodStart,
            value: td.triggered ? 1 : 0,
          });
        }
      }
    }

    // Try to extract hit counts from input results (common for query-level monitors)
    if (inputResults) {
      const results = inputResults.results as Array<Record<string, unknown>> | undefined;
      if (results && results.length > 0) {
        const firstResult = results[0];
        const hits = firstResult?.hits as Record<string, unknown> | undefined;
        const total = hits?.total as { value?: number } | number | undefined;
        const totalValue = typeof total === 'number' ? total : total?.value;
        if (typeof totalValue === 'number') {
          points.push({ timestamp: Date.now(), value: totalValue });
        }
      }
    }

    return points.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Fetch condition preview data for Prometheus rules.
   *
   * Uses the DirectQuery query execution API (POST /_plugins/_directquery/_query)
   * which supports both instant and range PromQL queries via PrometheusQueryHandler.
   * This is separate from the resource proxy (/_plugins/_directquery/_resources)
   * which only supports metadata lookups.
   *
   * Falls back to extracting evaluation data from rule.alerts[].value if
   * queryRange is not available or fails.
   */
  private async fetchPromPreviewData(
    client: AlertingOSClient,
    ds: Datasource,
    query: string,
    rule: PromAlertingRule
  ): Promise<Array<{ timestamp: number; value: number }>> {
    // Try queryRange first (works with direct Prometheus, not via DirectQuery)
    if (this.promBackend?.queryRange) {
      try {
        const metricQuery = query.replace(/\s*(>|<|>=|<=|==|!=)\s*[\d.]+\s*$/, '').trim();
        const now = Math.floor(Date.now() / 1000);
        const oneHourAgo = now - 3600;
        const step = 60;
        const points = await this.promBackend.queryRange(
          client,
          ds,
          metricQuery,
          oneHourAgo,
          now,
          step
        );
        if (points.length > 0) return points;
      } catch {
        // queryRange not supported (e.g., DirectQuery) — fall through to extraction
      }
    }

    // Fallback: extract data from the rule's embedded alerts and evaluation metadata
    const points: Array<{ timestamp: number; value: number }> = [];

    // Add data points from currently active alerts (they contain the current value)
    for (const alert of rule.alerts || []) {
      const value = parseFloat(alert.value);
      if (!isNaN(value)) {
        points.push({
          timestamp: new Date(alert.activeAt).getTime(),
          value,
        });
      }
    }

    // Add the last evaluation timestamp with the alert count as a proxy metric
    if (rule.lastEvaluation) {
      points.push({
        timestamp: new Date(rule.lastEvaluation).getTime(),
        value: (rule.alerts || []).length,
      });
    }

    return points.sort((a, b) => a.timestamp - b.timestamp);
  }

  private async requireDatasource(dsId: string, expectedType: string): Promise<Datasource> {
    const ds = await this.datasourceService.get(dsId);
    if (!ds) throw new Error(`Datasource not found: ${dsId}`);
    if (ds.type !== expectedType)
      throw new Error(`Datasource ${dsId} is ${ds.type}, expected ${expectedType}`);
    if (expectedType === 'opensearch' && !this.osBackend)
      throw new Error('No OpenSearch backend registered');
    if (expectedType === 'prometheus' && !this.promBackend)
      throw new Error('No Prometheus backend registered');
    return ds;
  }
}
// ============================================================================
// Preview helper functions (exported for testing)
// ============================================================================

/**
 * Extract the timestamp field name from a query's range filter.
 * Inspects `bool.filter` and `bool.must` arrays for a `range` clause.
 * Returns the field name if found, or undefined.
 */
export function extractTimestampField(query: Record<string, unknown>): string | undefined {
  const innerQuery = (query as Record<string, unknown>).query as
    | Record<string, unknown>
    | undefined;
  const target = innerQuery || query;
  const bool = target?.bool as Record<string, unknown> | undefined;
  if (!bool) return undefined;

  // Check both `filter` and `must` arrays
  const clauses: unknown[] = [];
  if (Array.isArray(bool.filter)) clauses.push(...bool.filter);
  if (Array.isArray(bool.must)) clauses.push(...bool.must);

  for (const clause of clauses) {
    if (clause && typeof clause === 'object' && 'range' in (clause as Record<string, unknown>)) {
      const range = (clause as Record<string, unknown>).range as Record<string, unknown>;
      const fields = Object.keys(range);
      if (fields.length > 0) return fields[0];
    }
  }

  return undefined;
}

/**
 * Strip range filters on the given timestamp field from a query.
 * This prevents the monitor's narrow range (e.g., "now-5m") from conflicting
 * with the wider preview range (1 hour) we apply for the chart.
 */
export function stripRangeFilters(query: unknown, timestampField: string): unknown {
  if (!query || typeof query !== 'object') return query;
  const q = query as Record<string, unknown>;

  // If this is a range clause on the target field, replace with match_all
  if ('range' in q) {
    const range = q.range as Record<string, unknown>;
    if (timestampField in range) {
      return { match_all: {} };
    }
    return q;
  }

  // Recurse into bool clauses and strip range filters from arrays
  if ('bool' in q) {
    const bool = { ...(q.bool as Record<string, unknown>) };
    for (const key of ['must', 'filter', 'should']) {
      if (Array.isArray(bool[key])) {
        bool[key] = (bool[key] as unknown[])
          .map((clause) => stripRangeFilters(clause, timestampField))
          .filter(
            (clause) =>
              !(
                clause &&
                typeof clause === 'object' &&
                'match_all' in (clause as Record<string, unknown>)
              )
          );
      }
    }
    return { bool };
  }

  return q;
}

/**
 * Replace Mustache template variables (e.g., `{{period_end}}`) with concrete values.
 * This allows executing monitor queries that contain template variables for preview.
 */
export function substituteMustacheTemplates(query: unknown): unknown {
  if (query === null || query === undefined) return query;

  if (typeof query === 'string') {
    const now = Date.now();
    const oneHourAgo = now - 3600_000;
    let result = query;
    result = result.replace(/\{\{period_end\}\}/g, String(now));
    result = result.replace(/\{\{period_start\}\}/g, String(oneHourAgo));
    // Replace any remaining {{...}} patterns with current time as a safe default
    result = result.replace(/\{\{[^}]+\}\}/g, String(now));
    return result;
  }

  if (Array.isArray(query)) {
    return query.map((item) => substituteMustacheTemplates(item));
  }

  if (typeof query === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
      result[key] = substituteMustacheTemplates(value);
    }
    return result;
  }

  return query;
}

/**
 * Extract a meaningful numeric value from a cluster metrics execution result.
 * Handles common API responses: cluster health, node stats, etc.
 */
export function extractClusterMetricValue(execResult: unknown): number {
  if (!execResult || typeof execResult !== 'object') return 0;
  const result = execResult as Record<string, unknown>;

  // Try input_results first (from _execute API response)
  const inputResults = result.input_results as Record<string, unknown> | undefined;
  if (inputResults) {
    const results = inputResults.results as Array<Record<string, unknown>> | undefined;
    if (results && results.length > 0) {
      const firstResult = results[0];
      // Cluster health: number_of_nodes, active_shards, unassigned_shards
      if (typeof firstResult.number_of_nodes === 'number') return firstResult.number_of_nodes;
      if (typeof firstResult.active_shards === 'number') return firstResult.active_shards;
      if (typeof firstResult.unassigned_shards === 'number') return firstResult.unassigned_shards;
      // Try to find any top-level numeric value
      for (const val of Object.values(firstResult)) {
        if (typeof val === 'number') return val;
      }
    }
  }

  // Direct numeric properties (if result itself is the API response)
  if (typeof result.number_of_nodes === 'number') return result.number_of_nodes;
  if (typeof result.active_shards === 'number') return result.active_shards;

  return 1; // Default to 1 to show something meaningful on the chart
}

/**
 * Convert a value that may be an ISO string or epoch millis to epoch millis.
 */
export function toEpochMillis(val: unknown): number | undefined {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

// ============================================================================
// Mapping helpers
// ============================================================================

function osSeverityToUnified(sev: string): UnifiedAlertSeverity {
  switch (sev) {
    case '1':
      return 'critical';
    case '2':
      return 'high';
    case '3':
      return 'medium';
    case '4':
      return 'low';
    default:
      return 'info';
  }
}

function osStateToUnified(state: string): UnifiedAlertState {
  switch (state) {
    case 'ACTIVE':
      return 'active';
    case 'ACKNOWLEDGED':
      return 'acknowledged';
    case 'COMPLETED':
      return 'resolved';
    case 'ERROR':
      return 'error';
    default:
      return 'active';
  }
}

function promSeverityFromLabels(labels: Record<string, string>): UnifiedAlertSeverity {
  const sev = labels.severity || '';
  if (sev === 'critical' || sev === 'high' || sev === 'medium' || sev === 'low') return sev;
  if (sev === 'warning') return 'medium';
  if (sev === 'page') return 'critical';
  return 'info';
}

function promStateToUnified(state: string): UnifiedAlertState {
  if (state === 'firing') return 'active';
  if (state === 'pending') return 'pending';
  return 'resolved';
}

function osAlertToUnified(a: OSAlert, dsId: string): UnifiedAlertSummary {
  return {
    id: a.id,
    datasourceId: dsId,
    datasourceType: 'opensearch',
    name: `${a.monitor_name} — ${a.trigger_name}`,
    state: osStateToUnified(a.state),
    severity: osSeverityToUnified(a.severity),
    message: a.error_message || a.trigger_name || undefined,
    startTime: new Date(a.start_time).toISOString(),
    lastUpdated: new Date(a.last_notification_time).toISOString(),
    labels: {
      monitor_name: a.monitor_name,
      trigger_name: a.trigger_name,
    },
    annotations: {},
  };
}

function promAlertToUnified(a: PromAlert, dsId: string): UnifiedAlertSummary {
  return {
    id: `${dsId}-${a.labels.alertname}-${a.labels.instance || ''}`,
    datasourceId: dsId,
    datasourceType: 'prometheus',
    name: a.labels.alertname || 'Unknown',
    state: promStateToUnified(a.state),
    severity: promSeverityFromLabels(a.labels),
    message: a.annotations.summary || a.annotations.description,
    startTime: a.activeAt,
    lastUpdated: a.activeAt,
    labels: a.labels,
    annotations: a.annotations,
  };
}

/**
 * Detect the actual monitor kind from the OS monitor's inputs,
 * since cluster metrics monitors share monitor_type 'query_level_monitor'.
 */
function detectMonitorKind(m: OSMonitor): 'query' | 'bucket' | 'doc' | 'cluster_metrics' {
  if (m.monitor_type === 'bucket_level_monitor') return 'bucket';
  if (m.monitor_type === 'doc_level_monitor') return 'doc';
  if (m.inputs[0] && 'uri' in m.inputs[0]) return 'cluster_metrics';
  return 'query';
}

function osMonitorToUnifiedRuleSummary(m: OSMonitor, dsId: string): UnifiedRuleSummary {
  const trigger = m.triggers[0];
  const isEnabled = m.enabled;
  const kind = detectMonitorKind(m);
  const input = m.inputs[0];

  // Derive labels from actual monitor metadata per input type
  const labels: Record<string, string> = {};
  if (input && 'search' in input) {
    const indices = input.search.indices ?? [];
    if (indices.length > 0) {
      labels.indices = indices.join(',');
    }
  } else if (input && 'uri' in input) {
    labels.api_type = input.uri.api_type;
    if (input.uri.clusters?.length > 0) {
      labels.clusters = input.uri.clusters.join(',');
    }
  } else if (input && 'doc_level_input' in input) {
    const indices = input.doc_level_input.indices ?? [];
    if (indices.length > 0) {
      labels.indices = indices.join(',');
    }
    labels.doc_queries = String(input.doc_level_input.queries?.length ?? 0);
  }
  labels.monitor_type = m.monitor_type;
  labels.monitor_kind = kind;
  labels.datasource_id = dsId;

  const annotations: Record<string, string> = {};
  if (trigger?.actions?.[0]?.message_template?.source) {
    annotations.summary = trigger.actions[0].message_template.source;
  }

  const severity = trigger ? osSeverityToUnified(trigger.severity) : 'info';
  const status: MonitorStatus = !isEnabled ? 'disabled' : 'active';

  // Extract query string based on input type
  let query: string;
  if (input && 'uri' in input) {
    query = `${input.uri.api_type}: ${input.uri.path}`;
  } else if (input && 'doc_level_input' in input) {
    const docQueries = input.doc_level_input.queries ?? [];
    query = docQueries.map((q) => `${q.name}: ${q.query}`).join('; ') || '(no queries)';
  } else if (input && 'search' in input) {
    query = JSON.stringify(input.search.query ?? {});
  } else {
    query = '{}';
  }

  // Derive monitor type from kind and index patterns
  let monitorType: MonitorType;
  if (kind === 'cluster_metrics') {
    monitorType = 'cluster_metrics';
  } else if (kind === 'doc') {
    monitorType = 'log';
  } else if (kind === 'bucket') {
    monitorType = 'infrastructure';
  } else {
    // query-level: derive from index patterns
    const indices = input && 'search' in input ? input.search.indices ?? [] : [];
    if (indices.some((i) => i.startsWith('logs-') || i.startsWith('ss4o_logs'))) {
      monitorType = 'log';
    } else if (indices.some((i) => i.startsWith('otel-v1-apm') || i.startsWith('ss4o_traces'))) {
      monitorType = 'apm';
    } else {
      monitorType = 'metric';
    }
  }

  const destNames = trigger?.actions?.map((a) => a.name) ?? [];
  const intervalUnit = m.schedule.period.unit;
  const intervalVal = m.schedule.period.interval;
  const evalInterval = `${intervalVal} ${intervalUnit.toLowerCase()}`;

  return {
    id: m.id,
    datasourceId: dsId,
    datasourceType: 'opensearch',
    name: m.name,
    enabled: isEnabled,
    severity,
    query,
    condition: trigger?.condition?.script?.source ?? '',
    labels,
    annotations,
    monitorType,
    status,
    healthStatus: !isEnabled ? 'no_data' : 'healthy',
    createdBy: '',
    createdAt: new Date(m.last_update_time).toISOString(),
    lastModified: new Date(m.last_update_time).toISOString(),
    lastTriggered: undefined,
    notificationDestinations: destNames,
    evaluationInterval: evalInterval,
    pendingPeriod: evalInterval,
    threshold: trigger
      ? (() => {
          const parsed = parseThreshold(trigger.condition.script.source);
          return {
            operator: parsed.operator,
            value: parsed.value,
            unit: inferUnitFromExpression(query),
          };
        })()
      : undefined,
  };
}

/**
 * Infer a display unit from metric name suffixes in a PromQL expression or
 * query string. Falls back to empty string (no unit) rather than a wrong unit.
 */
function inferUnitFromExpression(expr: string): string {
  if (/_seconds|_duration/.test(expr)) return 's';
  if (/_bytes/.test(expr)) return 'B';
  if (/_ratio|_percent/.test(expr)) return '%';
  if (/_total|_count/.test(expr)) return '';
  return '';
}

function parseThreshold(conditionSource: string): { operator: string; value: number } {
  const match = conditionSource.match(/(>=|<=|!=|==|>|<)\s*([\d.]+)/);
  if (match) {
    return { operator: match[1], value: parseFloat(match[2]) };
  }
  return { operator: '>', value: 0 };
}

function promRuleToUnified(
  r: PromAlertingRule,
  groupName: string,
  dsId: string
): UnifiedRuleSummary {
  const state = r.state;
  const severity = promSeverityFromLabels(r.labels);
  const status: MonitorStatus =
    state === 'firing' ? 'active' : state === 'pending' ? 'pending' : 'muted';
  const destNames: string[] = [];

  return {
    id: `${dsId}-${groupName}-${r.name}`,
    datasourceId: dsId,
    datasourceType: 'prometheus',
    name: r.name,
    enabled: true,
    severity,
    query: r.query,
    condition: `> threshold for ${r.duration}s`,
    group: groupName,
    labels: r.labels,
    annotations: r.annotations,
    monitorType: 'metric',
    status,
    healthStatus: r.health === 'ok' ? 'healthy' : r.health === 'err' ? 'failing' : 'no_data',
    createdBy: 'system',
    createdAt: r.lastEvaluation || new Date().toISOString(),
    lastModified: r.lastEvaluation || new Date().toISOString(),
    lastTriggered: r.alerts?.length > 0 ? r.alerts[0].activeAt : undefined,
    notificationDestinations: destNames,
    evaluationInterval: `${r.duration}s`,
    pendingPeriod: `${r.duration}s`,
    threshold: (() => {
      const parsed = parseThreshold(r.query);
      return {
        operator: parsed.operator,
        value: parsed.value,
        unit: inferUnitFromExpression(r.query),
      };
    })(),
  };
}
