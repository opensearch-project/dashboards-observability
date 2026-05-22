/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Real OpenSearch Alerting backend — talks to _plugins/_alerting REST APIs.
 *
 * API reference: https://opensearch.org/docs/latest/observing-your-data/alerting/api/
 */
import {
  AlertingOSClient,
  Logger,
  OpenSearchBackend,
  OSAction,
  OSMonitor,
  OSAlert,
  OSDestination,
  OSPPLConditionType,
  OSPPLNumResultsOperator,
  OSPPLTrigger,
  OSPPLTriggerBody,
  OSTrigger,
  OSSearchResponse,
  OSGetMonitorResponse,
  OSCreateMonitorResponse,
  OSAlertsApiResponse,
  OSAlertRaw,
  OSMonitorSource,
  OSRawPPLTrigger,
  OSRawTrigger,
  OSRawAction,
  OSDestinationRaw,
  OSDestinationsApiResponse,
} from '../../../common/types/alerting';
import { createConflictError, createInternalError, isStatusCode } from './errors';

export class HttpOpenSearchBackend implements OpenSearchBackend {
  readonly type = 'opensearch' as const;

  constructor(private readonly logger: Logger) {}

  // =========================================================================
  // Monitors
  // =========================================================================

  async getMonitors(client: AlertingOSClient): Promise<OSMonitor[]> {
    const PAGE_SIZE = 100;
    const monitors: OSMonitor[] = [];
    let searchAfter: unknown[] | undefined;

    // Use search_after pagination to retrieve all monitors
    while (true) {
      const body: Record<string, unknown> = {
        query: { match_all: {} },
        size: PAGE_SIZE,
        sort: [{ _id: 'asc' }],
      };
      if (searchAfter) {
        body.search_after = searchAfter;
      }

      const resp = await this.req<OSSearchResponse>(
        client,
        'POST',
        '/_plugins/_alerting/monitors/_search',
        body
      );
      const hits = resp.body?.hits?.hits ?? [];
      if (hits.length === 0) break;

      for (const hit of hits) {
        monitors.push(this.mapMonitor(hit._id, hit._source));
      }

      if (hits.length < PAGE_SIZE) break;
      searchAfter = hits[hits.length - 1].sort;
    }

    return monitors;
  }

  async getMonitor(client: AlertingOSClient, monitorId: string): Promise<OSMonitor | null> {
    try {
      const resp = await this.req<OSGetMonitorResponse>(
        client,
        'GET',
        `/_plugins/_alerting/monitors/${encodeURIComponent(monitorId)}`
      );
      return this.mapMonitor(resp.body._id, resp.body.monitor);
    } catch (err) {
      if (this.is404(err)) return null;
      throw err;
    }
  }

  async createMonitor(
    client: AlertingOSClient,
    monitor: Omit<OSMonitor, 'id'>
  ): Promise<OSMonitor> {
    // Pass the body as-is (already has `type: "monitor"` from the client).
    // Don't re-spread — preserves the exact shape the alerting plugin expects.
    const resp = await this.req<OSCreateMonitorResponse>(
      client,
      'POST',
      '/_plugins/_alerting/monitors',
      monitor
    );
    return this.mapMonitor(resp.body._id, resp.body.monitor);
  }

  async updateMonitor(
    client: AlertingOSClient,
    monitorId: string,
    input: Partial<OSMonitor>
  ): Promise<OSMonitor | null> {
    const encodedMonitorId = encodeURIComponent(monitorId);

    // Fetch the current monitor with version info for optimistic concurrency.
    // Splitting the GET and PUT lets us distinguish a missing monitor (return
    // null) from a conflict on write (throw typed conflict).
    let getResp: { body: OSGetMonitorResponse };
    try {
      getResp = await this.req<OSGetMonitorResponse>(
        client,
        'GET',
        `/_plugins/_alerting/monitors/${encodedMonitorId}`
      );
    } catch (err) {
      if (this.is404(err)) return null;
      throw err;
    }

    const seqNo = getResp.body._seq_no;
    const primaryTerm = getResp.body._primary_term;
    // Optimistic concurrency control requires both values. If either is
    // missing, fail hard rather than silently downgrade to a non-CAS write —
    // that would allow concurrent writers to clobber each other.
    if (seqNo === undefined || primaryTerm === undefined) {
      throw createInternalError(
        'OpenSearch Alerting GET monitor response missing _seq_no or _primary_term; refusing non-CAS update'
      );
    }

    const current = this.mapMonitor(getResp.body._id, getResp.body.monitor);
    const { id: _id, ...currentFields } = current;
    const merged = { ...currentFields, ...input, last_update_time: Date.now() };

    const putPath =
      `/_plugins/_alerting/monitors/${encodedMonitorId}` +
      `?if_seq_no=${seqNo}&if_primary_term=${primaryTerm}`;

    try {
      const resp = await this.req<OSCreateMonitorResponse>(client, 'PUT', putPath, {
        ...merged,
        type: 'monitor',
      });
      return this.mapMonitor(resp.body._id, resp.body.monitor);
    } catch (err) {
      if (this.is404(err)) return null;
      if (isStatusCode(err, 409)) {
        throw createConflictError(
          `Monitor ${monitorId} was modified by another writer; re-fetch and retry`,
          monitorId
        );
      }
      throw err;
    }
  }

  async deleteMonitor(client: AlertingOSClient, monitorId: string): Promise<boolean> {
    try {
      await this.req(
        client,
        'DELETE',
        `/_plugins/_alerting/monitors/${encodeURIComponent(monitorId)}`
      );
      return true;
    } catch (err) {
      if (this.is404(err)) return false;
      throw err;
    }
  }

  async runMonitor(
    client: AlertingOSClient,
    monitorId: string,
    dryRun?: boolean
  ): Promise<unknown> {
    const resp = await this.req<unknown>(
      client,
      'POST',
      `/_plugins/_alerting/monitors/${encodeURIComponent(monitorId)}/_execute`,
      {
        dryrun: dryRun ?? false,
      }
    );
    return resp.body;
  }

  async searchQuery(
    client: AlertingOSClient,
    indices: string[],
    body: Record<string, unknown>
  ): Promise<unknown> {
    const indexPattern = indices.join(',');
    const resp = await this.req<unknown>(client, 'POST', `/${indexPattern}/_search`, body);
    return resp.body;
  }

  // =========================================================================
  // Alerts
  // =========================================================================

  async getAlerts(
    client: AlertingOSClient,
    options?: { startMs?: number; endMs?: number }
  ): Promise<{ alerts: OSAlert[]; totalAlerts: number; truncated: boolean }> {
    const PAGE_SIZE = 100;
    /**
     * Cap applied only when a time window is supplied. OpenSearch Alerting's
     * `GET monitors/alerts` endpoint has no documented server-side time
     * filter (as of 2.x), so we post-fetch and then paginate-stop once the
     * filtered collection reaches this limit. The UI surfaces `truncated`
     * as an `EuiCallOut` prompting the user to narrow the range.
     *
     * Scope: this cap is PER-DATASOURCE. The unified service aggregates
     * results across N datasources and forwards any `truncated: true` to
     * the UI, but does not sum alert counts — so the unified view can show
     * up to `N * FILTER_CAP` rows with no `truncated` flag if no single
     * datasource individually exceeds the cap.
     */
    const FILTER_CAP = 1000;
    // Hard ceiling on rows we'll page through, regardless of `FILTER_CAP`.
    // Without this, a cluster with 100k+ alerts where almost none fall
    // inside the window forces us to issue 1000+ sequential requests before
    // the post-filter cap can stop us. 10k rows = at most 100 pages of 100
    // — bounded worst-case latency, and any genuinely-larger backlog should
    // already be hitting `FILTER_CAP` (which assumes the filter matches).
    const SCAN_CAP = 10_000;
    const hasRange = options?.startMs !== undefined && options?.endMs !== undefined;
    const windowStart = options?.startMs ?? 0;
    const windowEnd = options?.endMs ?? Number.POSITIVE_INFINITY;

    const allAlerts: OSAlert[] = [];
    let startIndex = 0;
    let totalAlerts = 0;
    let truncated = false;

    // Paginate through all alerts
    while (true) {
      const resp = await this.req<OSAlertsApiResponse>(
        client,
        'GET',
        `/_plugins/_alerting/monitors/alerts?size=${PAGE_SIZE}&startIndex=${startIndex}`
      );
      totalAlerts = resp.body.totalAlerts ?? 0;
      const pageAlerts: OSAlert[] = (resp.body.alerts ?? []).map((a: OSAlertRaw) =>
        this.mapAlert(a)
      );

      if (hasRange) {
        for (const a of pageAlerts) {
          // Active alerts have no end_time — treat as "still ongoing through
          // the window end". Using `windowEnd` (the range resolved ONCE at
          // the service entry) rather than a fresh `Date.now()` keeps the
          // filter deterministic across multi-page scans: a pagination pass
          // that spans several seconds won't let `now` drift past each
          // page's comparisons and change which alerts the filter accepts.
          //
          // This gives us a standard interval-overlap predicate:
          //   alert.start_time <= windowEnd  AND  effectiveEnd >= windowStart
          // which INCLUDES alerts that started before the window and are
          // still active, and EXCLUDES alerts that resolved before the
          // window opened or started after it closed.
          const effectiveEnd = a.end_time ?? windowEnd;
          if (a.start_time <= windowEnd && effectiveEnd >= windowStart) {
            allAlerts.push(a);
            if (allAlerts.length >= FILTER_CAP) {
              truncated = true;
              break;
            }
          }
        }
        if (truncated) break;
      } else {
        allAlerts.push(...pageAlerts);
      }

      if (pageAlerts.length < PAGE_SIZE) break;
      if (!hasRange && allAlerts.length >= totalAlerts) break;
      // We intentionally do NOT early-exit on `startIndex + PAGE_SIZE >=
      // totalAlerts` when filtering — `totalAlerts` is the server's raw
      // index count, not the filtered count. If the upstream total is
      // stale (a common thing during heavy ingest) or differs from the
      // actual number of alerts we'd see paginating, cutting the loop
      // based on it can terminate BEFORE we've seen the real last page,
      // dropping matches silently. `pageAlerts.length < PAGE_SIZE` is the
      // authoritative end-of-stream signal; worst case we make one extra
      // empty request on an exact PAGE_SIZE multiple, which is cheap.
      startIndex += PAGE_SIZE;
      if (startIndex >= SCAN_CAP) {
        truncated = true;
        break;
      }
    }

    // When filtering, `totalAlerts` on the return object reflects the
    // filtered-and-capped count (what the caller actually received); the
    // raw index total is no longer a useful number for a post-filtered
    // payload and would confuse UI consumers.
    return {
      alerts: allAlerts,
      totalAlerts: hasRange ? allAlerts.length : totalAlerts,
      truncated,
    };
  }

  async acknowledgeAlerts(
    client: AlertingOSClient,
    monitorId: string,
    alertIds: string[]
  ): Promise<unknown> {
    const resp = await this.req<unknown>(
      client,
      'POST',
      `/_plugins/_alerting/monitors/${encodeURIComponent(monitorId)}/_acknowledge/alerts`,
      { alerts: alertIds }
    );
    return resp.body;
  }

  // =========================================================================
  // Destinations
  // =========================================================================

  async getDestinations(client: AlertingOSClient): Promise<OSDestination[]> {
    const resp = await this.req<OSDestinationsApiResponse>(
      client,
      'GET',
      '/_plugins/_alerting/destinations?size=200'
    );
    return (resp.body.destinations ?? []).map((d: OSDestinationRaw) => this.mapDestination(d));
  }

  async createDestination(
    client: AlertingOSClient,
    dest: Omit<OSDestination, 'id'>
  ): Promise<OSDestination> {
    const resp = await this.req<{ _id: string; destination: OSDestinationRaw }>(
      client,
      'POST',
      '/_plugins/_alerting/destinations',
      dest
    );
    return this.mapDestination({ id: resp.body._id, ...resp.body.destination });
  }

  async deleteDestination(client: AlertingOSClient, destId: string): Promise<boolean> {
    try {
      await this.req(
        client,
        'DELETE',
        `/_plugins/_alerting/destinations/${encodeURIComponent(destId)}`
      );
      return true;
    } catch (err) {
      if (this.is404(err)) return false;
      throw err;
    }
  }

  // =========================================================================
  // Index discovery — feeds the Create/Edit flyout's "Define index" picker
  // and the timestamp-field selector. Wraps `_cat/indices`, `_cat/aliases`,
  // and `_mapping`. Mirrors alerting-dashboards-plugin's OpensearchService
  // shapes so existing UX patterns transfer cleanly.
  // =========================================================================

  /** `GET /_cat/indices/{search}?format=json&h=health,index,status` */
  async getIndices(
    client: AlertingOSClient,
    search: string
  ): Promise<Array<{ index: string; status?: string; health?: string }>> {
    const safe = encodeURIComponent(search.trim() || '*');
    try {
      const resp = await this.req<Array<{ index: string; status?: string; health?: string }>>(
        client,
        'GET',
        `/_cat/indices/${safe}?format=json&h=health,index,status`
      );
      return resp.body ?? [];
    } catch (err) {
      // Treat index-not-found as empty so partial wildcards return cleanly.
      if (this.is404(err)) return [];
      throw err;
    }
  }

  /** `GET /_cat/aliases/{search}?format=json&h=alias,index` */
  async getAliases(
    client: AlertingOSClient,
    search: string
  ): Promise<Array<{ alias: string; index: string }>> {
    const safe = encodeURIComponent(search.trim() || '*');
    try {
      const resp = await this.req<Array<{ alias: string; index: string }>>(
        client,
        'GET',
        `/_cat/aliases/${safe}?format=json&h=alias,index`
      );
      return resp.body ?? [];
    } catch (err) {
      if (this.is404(err)) return [];
      throw err;
    }
  }

  /**
   * `GET /{indices}/_mapping` — flattens nested properties into dotted paths
   * grouped by data type. Returns `{ date: ['@timestamp', ...], keyword: [...], ... }`
   * matching alerting-dashboards-plugin's `getPathsPerDataType` shape.
   */
  async getFieldsByType(
    client: AlertingOSClient,
    indices: string[]
  ): Promise<Record<string, string[]>> {
    if (indices.length === 0) return {};
    const path = `/${indices.map(encodeURIComponent).join(',')}/_mapping`;
    let raw: Record<string, { mappings?: { properties?: Record<string, unknown> } }> = {};
    try {
      const resp = await this.req<typeof raw>(client, 'GET', path);
      raw = resp.body ?? {};
    } catch (err) {
      if (this.is404(err)) return {};
      throw err;
    }
    const acc: Record<string, Set<string>> = {};
    for (const idxBlob of Object.values(raw)) {
      const props = idxBlob?.mappings?.properties;
      if (!props) continue;
      collectFieldPaths(props, '', acc);
    }
    const out: Record<string, string[]> = {};
    for (const [type, set] of Object.entries(acc)) {
      out[type] = Array.from(set).sort();
    }
    return out;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async req<T = unknown>(
    client: AlertingOSClient,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<{ body: T }> {
    const resp = await client.transport.request({
      method,
      path,
      body: body || undefined,
    });
    return { body: resp.body as T };
  }

  private mapMonitor(id: string, source: OSMonitorSource): OSMonitor {
    const rawType = source.monitor_type;
    const monitorType: OSMonitor['monitor_type'] =
      rawType === 'query_level_monitor' ||
      rawType === 'bucket_level_monitor' ||
      rawType === 'doc_level_monitor' ||
      rawType === 'ppl_monitor'
        ? rawType
        : 'query_level_monitor';

    const isPpl = monitorType === 'ppl_monitor';
    return {
      id,
      type: (source.type as OSMonitor['type']) || 'monitor',
      monitor_type: monitorType,
      name: source.name || '',
      enabled: source.enabled ?? true,
      schedule: source.schedule || { period: { interval: 5, unit: 'MINUTES' } },
      inputs: source.inputs || [],
      triggers: (source.triggers || []).map((t: OSRawTrigger) =>
        isPpl || t.ppl_trigger ? this.mapPplTrigger(t) : this.mapTrigger(t)
      ),
      last_update_time: source.last_update_time || Date.now(),
      schema_version: source.schema_version,
    };
  }

  private mapTrigger(t: OSRawTrigger): OSTrigger {
    // OpenSearch returns triggers in different formats depending on monitor_type
    // For query_level_monitor: { query_level_trigger: { ... } }
    // For bucket_level_monitor: { bucket_level_trigger: { ... } }
    // Normalize to flat trigger format
    const inner = (t.query_level_trigger ||
      t.bucket_level_trigger ||
      t.doc_level_trigger ||
      t) as OSRawTrigger;
    return {
      id: inner.id || '',
      name: inner.name || '',
      severity: String(inner.severity || '3') as OSTrigger['severity'],
      condition: {
        script: {
          source: inner.condition?.script?.source || '',
          lang: inner.condition?.script?.lang || 'painless',
        },
      },
      actions: (inner.actions || []).map((a: OSRawAction) => this.mapAction(a)),
    };
  }

  private mapPplTrigger(t: OSRawTrigger): OSPPLTrigger {
    const inner = (t.ppl_trigger || t) as OSRawPPLTrigger;
    const conditionType: OSPPLConditionType =
      inner.type === 'custom' ? 'custom' : 'number_of_results';
    return {
      ppl_trigger: {
        id: inner.id || '',
        name: inner.name || '',
        severity: String(inner.severity || '3') as OSPPLTriggerBody['severity'],
        actions: (inner.actions || []).map((a: OSRawAction) => this.mapAction(a)),
        type: conditionType,
        num_results_condition: inner.num_results_condition as OSPPLNumResultsOperator | undefined,
        num_results_value: inner.num_results_value,
        custom_condition: inner.custom_condition,
      },
    };
  }

  private mapAction(a: OSRawAction): OSAction {
    return {
      id: a.id || '',
      name: a.name || '',
      destination_id: a.destination_id || '',
      message_template: { source: a.message_template?.source || '' },
      subject_template: a.subject_template
        ? { source: a.subject_template.source || '' }
        : undefined,
      throttle_enabled: a.throttle_enabled ?? false,
      throttle: a.throttle as OSAction['throttle'],
    };
  }

  private mapAlert(a: OSAlertRaw): OSAlert {
    return {
      id: a.id || a.alert_id || '',
      version: a.version ?? 1,
      monitor_id: a.monitor_id || '',
      monitor_name: a.monitor_name || '',
      monitor_version: a.monitor_version ?? 1,
      trigger_id: a.trigger_id || '',
      trigger_name: a.trigger_name || '',
      state: (a.state || 'ACTIVE') as OSAlert['state'],
      severity: String(a.severity || '3') as OSAlert['severity'],
      error_message: a.error_message || null,
      start_time: a.start_time || Date.now(),
      last_notification_time: a.last_notification_time || Date.now(),
      end_time: a.end_time || null,
      acknowledged_time: a.acknowledged_time || null,
      action_execution_results: (a.action_execution_results ||
        []) as OSAlert['action_execution_results'],
    };
  }

  private mapDestination(d: OSDestinationRaw): OSDestination {
    return {
      id: d.id || '',
      type: (d.type || 'custom_webhook') as OSDestination['type'],
      name: d.name || '',
      last_update_time: d.last_update_time || Date.now(),
      schema_version: d.schema_version,
      slack: d.slack,
      custom_webhook: d.custom_webhook,
      email: d.email,
    };
  }

  private is404(err: unknown): boolean {
    return isStatusCode(err, 404);
  }
}

// ============================================================================
// Mapping flattener
// ============================================================================

interface MappingNode {
  type?: string;
  enabled?: boolean;
  index?: boolean;
  properties?: Record<string, unknown>;
  fields?: Record<string, { type?: string }>;
}

/**
 * Walk a `_mapping` properties object and collect dotted field paths grouped
 * by leaf type. Mirrors alerting-dashboards-plugin's traversal:
 *   - skips `enabled: false` and `index: false`
 *   - skips `nested` types (UI doesn't surface them)
 *   - emits `<path>.keyword` when a multifield keyword is declared
 */
function collectFieldPaths(
  properties: Record<string, unknown>,
  parentPath: string,
  acc: Record<string, Set<string>>
): void {
  for (const [field, raw] of Object.entries(properties)) {
    const node = raw as MappingNode;
    if (!node || typeof node !== 'object') continue;
    if (node.enabled === false || node.index === false || node.type === 'nested') continue;

    const path = parentPath ? `${parentPath}.${field}` : field;

    if (node.properties) {
      collectFieldPaths(node.properties, path, acc);
      continue;
    }

    const type = node.type;
    if (type) {
      if (!acc[type]) acc[type] = new Set();
      acc[type].add(path);
    }

    if (node.fields?.keyword) {
      if (!acc.keyword) acc.keyword = new Set();
      acc.keyword.add(`${path}.keyword`);
    }
  }
}
