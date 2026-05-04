/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert service — orchestrates OpenSearch and Prometheus backends,
 * and provides a unified view for the UI.
 *
 * This file owns the `MultiBackendAlertService` class: constructor, backend
 * registration, OS/Prom pass-through delegates, unified + paginated views,
 * per-datasource fetch helpers, and the per-request timeout wrapper.
 *
 * Detail resolvers (rule/alert flyout data) live in `alert_detail.ts`.
 * Preview time-series helpers live in `alert_preview.ts`.
 * Pure utilities and unified-shape mappers live in `alert_utils.ts`.
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
  PromRuleGroup,
  ProgressiveResponse,
  PaginatedResponse,
  UnifiedAlertSummary,
  UnifiedFetchOptions,
  UnifiedAlert,
  UnifiedRule,
  UnifiedRuleSummary,
} from '../../../common/types/alerting';
import { TimeoutError } from './timeout_error';
import {
  getAlertDetail as getAlertDetailImpl,
  getRuleDetail as getRuleDetailImpl,
} from './alert_detail';
import {
  osAlertToUnified,
  osMonitorToUnifiedRuleSummary,
  promAlertToUnified,
  promRuleToUnified,
  requireDatasource as requireDatasourceImpl,
} from './alert_utils';

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
   * Get full detail for a single rule/monitor. Delegates to the standalone
   * resolver in `alert_detail.ts` so the detail logic (history, routing,
   * preview) lives outside this class but is still reachable from the routes.
   */
  async getRuleDetail(
    client: AlertingOSClient,
    dsId: string,
    ruleId: string
  ): Promise<UnifiedRule | null> {
    return getRuleDetailImpl(
      this.datasourceService,
      this.osBackend,
      this.promBackend,
      client,
      dsId,
      ruleId
    );
  }

  /**
   * Get full detail for a single alert including raw backend data. Delegates
   * to the standalone resolver in `alert_detail.ts`.
   */
  async getAlertDetail(
    client: AlertingOSClient,
    dsId: string,
    alertId: string
  ): Promise<UnifiedAlert | null> {
    return getAlertDetailImpl(
      this.datasourceService,
      this.osBackend,
      this.promBackend,
      client,
      dsId,
      alertId
    );
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
   * Thin wrapper over the standalone `requireDatasource` helper that passes
   * this service's current datasource service + registered backends.
   */
  private async requireDatasource(dsId: string, expectedType: string): Promise<Datasource> {
    return requireDatasourceImpl(
      this.datasourceService,
      this.osBackend,
      this.promBackend,
      dsId,
      expectedType
    );
  }
}
