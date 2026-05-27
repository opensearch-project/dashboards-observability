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
import type { RequestHandlerContext } from '../../../../../src/core/server';
import {
  AlertingOSClient,
  Datasource,
  DatasourceFetchFallback,
  DatasourceFetchResult,
  DatasourceFetchStatus,
  DatasourceService,
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
import { parseDateMathMs, computeStep } from '../../../common/services/alerting';
import { TimeoutError } from './timeout_error';
import { extractErrorMessage } from './errors';
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
/**
 * Concurrency cap on per-datasource fan-outs. The unified views fan a
 * single OSD request out to up to `ALERT_MANAGER_MAX_DATASOURCES_LIMIT`
 * datasources. Without a cap we'd issue N concurrent transport requests,
 * which can exhaust the HTTP agent pool (Node's default `maxSockets` is
 * lazy-allocated per host but each datasource is potentially a different
 * host, and concurrent reuse of a single host's pool is also sensitive
 * to keep-alive limits). Batching at 5 keeps tail latency comparable to
 * the unbounded version on healthy clusters and prevents one slow
 * datasource from blocking the whole batch via timeout pile-up.
 */
export const FANOUT_CONCURRENCY = 5;

/**
 * Run `tasks` in parallel batches of at most `concurrency` at a time,
 * preserving input order in the output. Returns Promise.allSettled-shape
 * results so callers can keep their existing fulfilled/rejected branching.
 *
 * Implementation note: the simplest correct shape is "fixed-size worker
 * pool that pulls the next pending index off a cursor". Pure batched
 * `Promise.allSettled` (chunk → await → next chunk) is half the size but
 * has worse worst-case latency: a slow datasource in chunk[0] blocks all
 * of chunk[1] from even starting. Workers consume the queue independently
 * so a fast datasource doesn't wait on a slow one in the same batch.
 */
export async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number = FANOUT_CONCURRENCY
): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      try {
        const value = await tasks[i]();
        results[i] = { status: 'fulfilled', value };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Resolved time window in epoch milliseconds — product of calling
 * `parseDateMathMs` once on the incoming `startTime`/`endTime` date-math
 * strings. Threaded through `fetchAlertsRaw` so each backend gets a
 * numeric window instead of re-parsing date-math at every hop.
 *
 * `endIsNow` records whether the original `endTime` string was relative
 * to `now` (e.g. `"now"`, `"now-5m"`). Backends use this signal to decide
 * whether an empty historical response should fall back to current-only
 * data; a past-only range should not. Kept on the resolved object so we
 * don't pass two values around.
 */
interface ResolvedRange {
  startMs: number;
  endMs: number;
  endIsNow: boolean;
}

/**
 * Per-datasource shape returned by `fetchAlertsRaw`. Carries the mapped
 * `UnifiedAlertSummary[]` plus optional envelope hints (truncation,
 * Prometheus fallback, error) that propagate up into
 * `DatasourceFetchResult`.
 */
interface FetchAlertsRawResult {
  alerts: UnifiedAlertSummary[];
  truncated?: boolean;
  fallback?: DatasourceFetchFallback;
  error?: string;
}

/**
 * Parse `startTime`/`endTime` date-math strings from a fetch options object
 * into a numeric `{ startMs, endMs, endIsNow }` triple. Returns `undefined`
 * when either side is missing so callers can use the legacy "no range"
 * path via a simple nullish check. Throws if either string is present but
 * unparseable — route-layer `validateDateMath` validators should already
 * have rejected that case with a 400, so a throw here is a genuine bug.
 *
 * `endIsNow` is true when the resolved end timestamp is at or near the
 * current wall-clock instant. The Prometheus historical path uses this to
 * decide whether an empty matrix should fall back to the current-only API
 * — that fallback only makes sense for windows that include "right now".
 * `"now-1h"` is `now`-relative but its window ENDS an hour ago, so it must
 * resolve to `endIsNow: false` (otherwise we'd merge `/api/v1/alerts`
 * results — which ignore time entirely — into a window they don't belong to).
 */
const NOW_TOLERANCE_MS = 60_000;

function resolveRangeMsFromOptions(options?: {
  startTime?: string;
  endTime?: string;
}): ResolvedRange | undefined {
  if (!options?.startTime || !options.endTime) return undefined;
  const startMs = parseDateMathMs(options.startTime, /* isEndTime */ false);
  const endMs = parseDateMathMs(options.endTime, /* isEndTime */ true);
  return {
    startMs,
    endMs,
    endIsNow: Math.abs(endMs - Date.now()) <= NOW_TOLERANCE_MS,
  };
}

export class MultiBackendAlertService {
  private osBackend?: OpenSearchBackend;
  private promBackend?: PrometheusBackend;

  constructor(
    private readonly datasourceService: DatasourceService,
    private readonly logger: Logger
  ) {}

  registerOpenSearch(backend: OpenSearchBackend): void {
    this.osBackend = backend;
    // `debug` (not `info`): this service is constructed per-request, so
    // registration fires on every request. Keep out of default log output.
    this.logger.debug('Registered OpenSearch alerting backend');
  }

  /** Access the Prometheus backend (e.g. for Alertmanager config route). */
  getPrometheusBackend(): PrometheusBackend | undefined {
    return this.promBackend;
  }

  registerPrometheus(backend: PrometheusBackend): void {
    this.promBackend = backend;
    // `debug` (not `info`): see registerOpenSearch.
    this.logger.debug('Registered Prometheus alerting backend');
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
    dsId: string,
    options?: { startTime?: string; endTime?: string }
  ): Promise<{ alerts: OSAlert[]; totalAlerts: number; truncated: boolean }> {
    await this.requireDatasource(dsId, 'opensearch');
    const range = resolveRangeMsFromOptions(options);
    return this.osBackend!.getAlerts(client, range);
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

  async getPromAlerts(
    client: AlertingOSClient,
    dsId: string,
    // Range is accepted for signature parity with the per-backend route, but
    // the per-backend `/api/alerting/prometheus/{dsId}/alerts` endpoint
    // returns raw `PromAlert[]` (not `UnifiedAlertSummary[]`), and the
    // historical-reconstruction path emits unified episodes. Per-backend
    // consumers therefore still see current-active alerts; historical
    // reconstruction is only surfaced through `getUnifiedAlerts`.
    options?: { startTime?: string; endTime?: string }
  ): Promise<PromAlert[]> {
    const ds = await this.requireDatasource(dsId, 'prometheus');
    if (options?.startTime || options?.endTime) {
      // Callers that specifically want a filtered view must go through the
      // unified endpoint; leaving this as a silent discard hides client
      // bugs (e.g. a UI assuming the per-backend route respects range).
      this.logger.debug(
        `getPromAlerts: ignoring startTime/endTime on per-backend route (ds=${dsId}); use /api/alerting/unified/alerts for historical range support`
      );
    }
    return this.promBackend!.getAlerts(client, ds);
  }

  // =========================================================================
  // Unified views (for the UI) — parallel with per-datasource timeout
  // =========================================================================

  async getUnifiedAlerts(
    clientOrResolver: AlertingOSClient | ((dsId: string) => Promise<AlertingOSClient>),
    options?: UnifiedFetchOptions,
    ctx?: RequestHandlerContext
  ): Promise<ProgressiveResponse<UnifiedAlertSummary>> {
    const datasources = await this.resolveDatasources(options?.dsIds);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
    const fetchedAt = new Date().toISOString();

    // Resolve date-math once at the top — downstream hops (backend dispatch,
    // filter, post-fetch cap) take numeric epoch-ms instead of re-parsing
    // strings per-datasource. Falls back to `undefined` when either field is
    // missing so the legacy "no range" path stays unchanged.
    const resolvedRange = resolveRangeMsFromOptions(options);

    const isResolver = typeof clientOrResolver === 'function';
    const dsResults = await runWithConcurrencyLimit(
      datasources.map((ds) => async () => {
        const client = isResolver ? await clientOrResolver(ds.id) : clientOrResolver;
        return this.fetchAlertsFromDatasource(
          client,
          ds,
          timeoutMs,
          resolvedRange,
          options?.onProgress,
          ctx
        );
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
          error: extractErrorMessage(settled.reason),
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
    const dsResults = await runWithConcurrencyLimit(
      datasources.map((ds) => async () => {
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
          error: extractErrorMessage(settled.reason),
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

    // Fetch from all datasources in batches (FANOUT_CONCURRENCY)
    const dsResults = await runWithConcurrencyLimit(
      datasources.map((ds) => () => this.fetchRulesRaw(client, ds))
    );

    for (let i = 0; i < datasources.length; i++) {
      const settled = dsResults[i];
      if (settled.status === 'fulfilled') {
        allRules.push(...settled.value);
      } else {
        this.logger.error(
          `Failed to fetch rules from ${datasources[i].name} (${
            datasources[i].id
          }): ${extractErrorMessage(settled.reason)}`
        );
        warnings.push({
          datasourceId: datasources[i].id,
          datasourceName: datasources[i].name,
          datasourceType: datasources[i].type,
          error: extractErrorMessage(settled.reason),
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

    // Fetch from all datasources in batches (FANOUT_CONCURRENCY)
    const dsResults = await runWithConcurrencyLimit(
      datasources.map((ds) => () => this.fetchAlertsRaw(client, ds))
    );

    for (let i = 0; i < datasources.length; i++) {
      const settled = dsResults[i];
      if (settled.status === 'fulfilled') {
        allAlerts.push(...settled.value.alerts);
      } else {
        this.logger.error(
          `Failed to fetch alerts from ${datasources[i].name} (${
            datasources[i].id
          }): ${extractErrorMessage(settled.reason)}`
        );
        warnings.push({
          datasourceId: datasources[i].id,
          datasourceName: datasources[i].name,
          datasourceType: datasources[i].type,
          error: extractErrorMessage(settled.reason),
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
   *
   * `ctx` is forwarded so the Prom branch can route the condition-preview
   * range query through the data plugin's search service (`strategy:
   * 'PROMQL'`). When omitted (legacy callers), the preview falls back to
   * the embedded-alert extractor inside `fetchPromPreviewData`.
   */
  async getRuleDetail(
    client: AlertingOSClient,
    dsId: string,
    ruleId: string,
    ctx?: RequestHandlerContext
  ): Promise<UnifiedRule | null> {
    return getRuleDetailImpl(
      this.datasourceService,
      this.osBackend,
      this.promBackend,
      client,
      dsId,
      ruleId,
      ctx
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
    range: ResolvedRange | undefined,
    onProgress?: (result: DatasourceFetchResult<UnifiedAlertSummary>) => void,
    ctx?: RequestHandlerContext
  ): Promise<DatasourceFetchResult<UnifiedAlertSummary>> {
    const start = Date.now();
    const makeResult = (
      status: DatasourceFetchStatus,
      data: UnifiedAlertSummary[],
      error?: string,
      extra?: { truncated?: boolean; fallback?: DatasourceFetchFallback }
    ): DatasourceFetchResult<UnifiedAlertSummary> => ({
      datasourceId: ds.id,
      datasourceName: ds.name,
      datasourceType: ds.type,
      status,
      data,
      error,
      durationMs: Date.now() - start,
      ...(extra?.truncated !== undefined ? { truncated: extra.truncated } : {}),
      ...(extra?.fallback !== undefined ? { fallback: extra.fallback } : {}),
    });

    try {
      const raw = await this.withTimeout(
        this.fetchAlertsRaw(client, ds, range, ctx),
        timeoutMs,
        `Datasource ${ds.name} timed out after ${timeoutMs}ms`
      );
      const result = makeResult('success', raw.alerts, raw.error, {
        truncated: raw.truncated,
        fallback: raw.fallback,
      });
      if (onProgress) onProgress(result);
      return result;
    } catch (err) {
      const isTimeout = err instanceof TimeoutError;
      const result = makeResult(isTimeout ? 'timeout' : 'error', [], extractErrorMessage(err));
      this.logger.error(`Failed to fetch alerts from ${ds.name}: ${extractErrorMessage(err)}`);
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
      const result = makeResult(isTimeout ? 'timeout' : 'error', [], extractErrorMessage(err));
      this.logger.error(`Failed to fetch rules from ${ds.name}: ${extractErrorMessage(err)}`);
      if (onProgress) onProgress(result);
      return result;
    }
  }

  /**
   * Fetch alerts from a single datasource, mapping raw backend shape to
   * `UnifiedAlertSummary[]`. Dispatches on `ds.type` AND on whether a
   * resolved range was passed:
   *
   *   - OpenSearch + range   ⇒ `osBackend.getAlerts(client, { startMs, endMs })`
   *                            with interval-overlap filter + 1000-alert cap.
   *                            Propagates `truncated` for the UI callout.
   *   - OpenSearch + no range⇒ legacy `osBackend.getAlerts(client)` (no filter).
   *   - Prometheus + range   ⇒ `promBackend.getHistoricalAlerts(...)` which
   *                            reconstructs episodes via range queries against
   *                            the `ALERTS` metric. Propagates `fallback` when
   *                            the matrix is empty AND the range includes `now`
   *                            (in which case the backend falls back to the
   *                            legacy current-only API).
   *   - Prometheus + no range⇒ legacy `promBackend.getAlerts(...)`
   *                            (current-active only).
   */
  private async fetchAlertsRaw(
    client: AlertingOSClient,
    ds: Datasource,
    range?: ResolvedRange,
    ctx?: RequestHandlerContext
  ): Promise<FetchAlertsRawResult> {
    if (ds.type === 'opensearch' && this.osBackend) {
      if (range) {
        const { alerts, truncated } = await this.osBackend.getAlerts(client, {
          startMs: range.startMs,
          endMs: range.endMs,
        });
        return {
          alerts: alerts.map((a) => osAlertToUnified(a, ds.id)),
          truncated,
        };
      }
      const { alerts } = await this.osBackend.getAlerts(client);
      return { alerts: alerts.map((a) => osAlertToUnified(a, ds.id)) };
    }

    if (ds.type === 'prometheus' && this.promBackend) {
      if (range) {
        // Historical reconstruction — only available on backends that
        // implement the optional `getHistoricalAlerts` method
        // (`DirectQueryPrometheusBackend` today) AND when we have an OSD
        // request context (the matrix scan routes through the data plugin's
        // search strategy). Without `ctx` we fall back to the legacy
        // current-only path with a banner rather than throwing.
        if (typeof this.promBackend.getHistoricalAlerts === 'function' && ctx) {
          const startSec = Math.floor(range.startMs / 1000);
          const endSec = Math.floor(range.endMs / 1000);
          const step = computeStep(startSec, endSec);
          const historical = await this.promBackend.getHistoricalAlerts(
            ctx,
            client,
            ds,
            startSec,
            endSec,
            step,
            range.endIsNow
          );
          return {
            alerts: historical.alerts,
            fallback: historical.fallback,
            error: historical.error,
          };
        }
        // No historical support ⇒ emulate by falling back to legacy with a banner.
        const alerts = await this.promBackend.getAlerts(client, ds);
        return {
          alerts: alerts.map((a) => promAlertToUnified(a, ds.id)),
          fallback: 'prometheus-alerts-current-only',
        };
      }
      const alerts = await this.promBackend.getAlerts(client, ds);
      return { alerts: alerts.map((a) => promAlertToUnified(a, ds.id)) };
    }

    return { alerts: [] };
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
