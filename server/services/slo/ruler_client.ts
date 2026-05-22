/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ruler client — writes SLO rule groups to a Prometheus-compatible ruler
 * (Cortex / Mimir) via the OpenSearch SQL plugin's DirectQuery resource proxy.
 *
 * Path: plugin → OSD scoped cluster client → /_plugins/_directquery/_resources/
 *       {dqName}/api/v1/rules/{namespace}[/{groupName}] → SQL plugin's
 *       Prometheus connector → Cortex ruler.
 *
 * Contract (verified upstream, 2026-04-23 pre-check):
 *   - Create/update: POST .../api/v1/rules/{namespace} with body = rule-group YAML
 *   - Delete:        DELETE .../api/v1/rules/{namespace}/{groupName}
 *   Bodies are forwarded verbatim to Cortex with Content-Type: application/yaml
 *   (the SQL plugin's PrometheusClientImpl sets that header on the upstream call;
 *    the OSD transport does not expose per-request headers so we rely on that).
 *
 * Dual-write atomicity:
 *   - Synchronous, fail-loud. One call. No retry, no backoff.
 *   - Errors surface as SloRulerError with a stable code, preserving upstream
 *     HTTP status + raw body so the wizard can render a self-service message.
 *   - Tenant identity lives in the SQL plugin's Prometheus connector config;
 *     this client never injects X-Scope-OrgID per request.
 *
 * Reference pattern: `DirectQueryPrometheusBackend` (the read-path sibling).
 */

/* eslint-disable max-classes-per-file */

import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import type { AlertingOSClient, Datasource, Logger } from '../../../common/types/alerting';
import type { GeneratedRule, GeneratedRuleGroup } from '../../../common/slo/slo_types';
import { SloRulerError } from '../../../common/slo/slo_errors';

/**
 * Ruler write surface. Reads are handled elsewhere (DirectQueryPrometheusBackend
 * exposes GET on the same resource paths) — this client is write-only.
 */
export interface RulerClient {
  /**
   * Upsert a rule group into the given namespace. Cortex's POST semantics are
   * create-or-replace within `(namespace, group.name)`, so replaying the same
   * body is idempotent — useful for the compensation retry path.
   */
  upsertRuleGroup(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    group: GeneratedRuleGroup
  ): Promise<void>;

  /**
   * Delete a single rule group. 404-tolerant: if the target is already gone,
   * resolves successfully so callers can use delete as "ensure absent".
   */
  deleteRuleGroup(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<void>;

  /**
   * GET a single rule group. Returns `null` on HTTP 404 so callers can
   * distinguish "missing" from "unreachable" (5xx still throws
   * `SloRulerError` with `RULER_UNREACHABLE`).
   */
  getRuleGroup(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<GeneratedRuleGroup | null>;

  /**
   * List all rule groups in a namespace. Returns `[]` on 404 (namespace
   * doesn't exist yet or is empty). Throws `SloRulerError` with
   * `RULER_UNREACHABLE` on 5xx.
   */
  listRuleGroups(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string
  ): Promise<GeneratedRuleGroup[]>;
}

// ============================================================================
// YAML serialization — Cortex / Prometheus rule-group format
// ============================================================================

/**
 * Serialize a GeneratedRuleGroup to the YAML shape Cortex accepts:
 *
 *   name: <groupName>
 *   interval: <Ns|Nm|Nh>
 *   rules:
 *     - record: <name>        # OR `alert: <name>`
 *       expr: <PromQL>
 *       for: <duration>?      # alerting only
 *       labels:   { k: v, ... }?
 *       annotations: { k: v, ... }?
 *
 * Uses js-yaml (already a plugin dep). `noRefs` keeps repeated label maps
 * readable; `lineWidth: -1` prevents wrapping long PromQL exprs across lines
 * (some rulers are strict about expr being one logical scalar).
 */
export function ruleGroupToYaml(group: GeneratedRuleGroup): string {
  const doc = {
    name: group.groupName,
    interval: formatInterval(group.interval),
    rules: group.rules.map(serializeRule),
  };
  return yamlDump(doc, { noRefs: true, lineWidth: -1, sortKeys: false });
}

function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function serializeRule(rule: GeneratedRule): Record<string, unknown> {
  // Preserve key ordering as Prometheus convention: record/alert first, expr, for, labels, annotations.
  const out: Record<string, unknown> = {};
  if (rule.type === 'recording') {
    out.record = rule.name;
  } else {
    out.alert = rule.name;
  }
  out.expr = rule.expr;
  if (rule.for) out.for = rule.for;
  if (rule.labels && Object.keys(rule.labels).length > 0) out.labels = { ...rule.labels };
  if (rule.annotations && Object.keys(rule.annotations).length > 0) {
    out.annotations = { ...rule.annotations };
  }
  return out;
}

// ============================================================================
// DirectQueryRulerClient — real implementation
// ============================================================================

/**
 * Build the DirectQuery resource path for a datasource's ruler surface.
 * Format mirrors DirectQueryPrometheusBackend.resourcePath — both dqName and
 * any path segments are encodeURIComponent'd so `/` inside a segment gets
 * escaped to %2F (which the SQL plugin's REST router treats as a single segment).
 */
function rulesPath(ds: Datasource, suffix: string): string {
  const dqName = ds.directQueryName;
  if (!dqName) {
    throw new Error(
      `Datasource "${ds.name}" (${ds.id}) has no directQueryName. ` +
        'It must be auto-discovered from the OpenSearch SQL plugin.'
    );
  }
  return `/_plugins/_directquery/_resources/${encodeURIComponent(dqName)}${suffix}`;
}

export class DirectQueryRulerClient implements RulerClient {
  constructor(private readonly logger: Logger) {
    this.logger.info('DirectQuery ruler client configured: writes via OSD scoped cluster client');
  }

  async upsertRuleGroup(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    group: GeneratedRuleGroup
  ): Promise<void> {
    const body = ruleGroupToYaml(group);
    const path = rulesPath(datasource, `/api/v1/rules/${encodeURIComponent(namespace)}`);
    this.logger.debug(
      `DirectQuery ruler POST ${path} (group=${group.groupName}, rules=${group.rules.length})`
    );

    try {
      // The OSD transport doesn't let us set Content-Type per request, but the
      // SQL plugin's PrometheusClientImpl forces Content-Type: application/yaml
      // on the upstream Cortex call — bodies are forwarded verbatim.
      await client.transport.request({
        method: 'POST',
        path,
        body,
      });
    } catch (err: unknown) {
      throw this.toRulerError(err);
    }
  }

  async deleteRuleGroup(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<void> {
    const path = rulesPath(
      datasource,
      `/api/v1/rules/${encodeURIComponent(namespace)}/${encodeURIComponent(groupName)}`
    );
    this.logger.debug(`DirectQuery ruler DELETE ${path}`);

    try {
      await client.transport.request({
        method: 'DELETE',
        path,
      });
    } catch (err: unknown) {
      // 404-tolerant: if the target is already gone we treat the delete as a
      // success — lets callers use deleteRuleGroup as an "ensure absent"
      // primitive without needing a pre-flight probe.
      if (extractHttpStatus(err) === 404) {
        this.logger.debug(
          `DirectQuery ruler DELETE ${path} returned 404 — rule group already gone, treating as success`
        );
        return;
      }
      throw this.toRulerError(err);
    }
  }

  /**
   * Probe a single rule group by name.
   *
   * Implementation reality: the OpenSearch SQL plugin's DirectQuery resource
   * router only registers `DELETE` on `{namespace}/{groupName}` — a GET
   * against that path returns HTTP 405 with
   * `allowed: [DELETE]`. So we cannot read a single group directly; we read
   * the whole namespace and filter by name. One round-trip either way; the
   * parser pays the cost of scanning siblings.
   */
  async getRuleGroup(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<GeneratedRuleGroup | null> {
    const groups = await this.listRuleGroups(client, datasource, namespace);
    return groups.find((g) => g.groupName === groupName) ?? null;
  }

  async listRuleGroups(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string
  ): Promise<GeneratedRuleGroup[]> {
    const path = rulesPath(datasource, `/api/v1/rules/${encodeURIComponent(namespace)}`);
    this.logger.debug(`DirectQuery ruler GET ${path}`);

    let response: unknown;
    try {
      response = await client.transport.request({
        method: 'GET',
        path,
      });
    } catch (err: unknown) {
      if (extractHttpStatus(err) === 404) {
        return [];
      }
      // The SQL plugin wraps Cortex's "no rule groups found" 404 as HTTP 400
      // with a `DataSourceClientException` / `PrometheusClientException`
      // envelope whose `details` contains `"Ruler request failed with code:
      // 404. Error details: no rule groups found"`. Treat that as an empty
      // namespace — anything else at 4xx is a real validation failure.
      if (isWrappedEmptyNamespaceError(err)) {
        return [];
      }
      throw this.toRulerError(err);
    }

    const body = extractResponseBody(response);
    const parsed = parseYamlBody(body);
    return coerceRuleGroupList(parsed);
  }

  /**
   * Classify a transport error into an SloRulerError. OpenSearch JS client
   * errors typically carry `statusCode`, `body`, and `meta` properties; we
   * extract defensively because the shape is not formally typed on the
   * structural AlertingOSClient transport we declare.
   */
  private toRulerError(err: unknown): SloRulerError {
    const raw = err as {
      statusCode?: number;
      body?: unknown;
      message?: string;
      meta?: { statusCode?: number; body?: unknown };
    };
    const httpStatus =
      typeof raw?.statusCode === 'number'
        ? raw.statusCode
        : typeof raw?.meta?.statusCode === 'number'
        ? raw.meta.statusCode
        : 0;
    const rawBody = stringifyBody(raw?.body ?? raw?.meta?.body ?? raw?.message ?? String(err));

    let code: 'RULER_VALIDATION_FAILED' | 'RULER_AUTH_FAILED' | 'RULER_UNREACHABLE';
    if (httpStatus === 401 || httpStatus === 403) {
      code = 'RULER_AUTH_FAILED';
    } else if (httpStatus >= 400 && httpStatus < 500) {
      code = 'RULER_VALIDATION_FAILED';
    } else {
      // 5xx, 0 (network / timeout / no response) — all unreachable for our purposes.
      code = 'RULER_UNREACHABLE';
    }

    return new SloRulerError(code, httpStatus, rawBody);
  }
}

function stringifyBody(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

/**
 * Pull an HTTP status code off the possibly-wrapped transport error. Mirrors
 * the extraction logic in `toRulerError` but returns the code only so the
 * probe paths can branch on 404 without building a full SloRulerError.
 */
/**
 * Cortex's ruler returns HTTP 404 with body `no rule groups found` when a
 * namespace exists but holds nothing (or hasn't yet been created). The
 * OpenSearch SQL plugin's DirectQuery proxy does not forward that status —
 * it wraps the response as HTTP 400 with a structured envelope:
 *
 *   { error: { type: '<...>ClientException',
 *              details: 'Ruler request failed with code: 404. ...' } }
 *
 * We pin to the envelope's `error.type` plus the upstream-code field inside
 * `details` so the classifier doesn't fire on a free-text 400 body that
 * happens to mention the strings — e.g. a user-supplied PromQL field
 * reflected back in an error. Anything else at 400 stays as a real
 * validation failure.
 */
function isWrappedEmptyNamespaceError(err: unknown): boolean {
  if (extractHttpStatus(err) !== 400) return false;
  const raw = err as { body?: unknown; meta?: { body?: unknown } };
  const candidates: unknown[] = [raw?.body, raw?.meta?.body];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const error = (candidate as { error?: unknown }).error;
    if (!error || typeof error !== 'object') continue;
    const { type, details } = error as { type?: unknown; details?: unknown };
    if (typeof type !== 'string' || !/ClientException$/.test(type)) continue;
    if (typeof details !== 'string') continue;
    // Upstream Cortex status is embedded as `code: <N>` inside details.
    const match = /\bcode:\s*(\d{3})\b/.exec(details);
    if (match && match[1] === '404') return true;
  }
  return false;
}

function extractHttpStatus(err: unknown): number {
  const raw = err as {
    statusCode?: number;
    meta?: { statusCode?: number };
  };
  if (typeof raw?.statusCode === 'number') return raw.statusCode;
  if (typeof raw?.meta?.statusCode === 'number') return raw.meta.statusCode;
  return 0;
}

/**
 * OSD's scoped cluster client `transport.request` typically returns `{ body,
 * statusCode, headers, warnings, meta }`. The SQL plugin's DirectQuery proxy
 * forwards the upstream ruler body through that same envelope, so we peel off
 * `.body` when present and otherwise pass the response through as-is.
 */
function extractResponseBody(response: unknown): unknown {
  if (response && typeof response === 'object' && 'body' in response) {
    return (response as { body: unknown }).body;
  }
  return response;
}

/**
 * The ruler responds with YAML that may arrive either as a raw string (when
 * the transport hasn't pre-parsed) or as an already-decoded object (when it
 * has). Accept both.
 */
function parseYamlBody(body: unknown): unknown {
  if (body == null) return null;
  if (typeof body === 'string') {
    if (body.trim() === '') return null;
    try {
      return yamlLoad(body);
    } catch {
      return null;
    }
  }
  return body;
}

/**
 * Coerce a ruler rule-group document (either the Prometheus `{ name,
 * interval, rules }` shape or a close variant) into our `GeneratedRuleGroup`.
 * Returns `null` when the input can't plausibly be a rule group so callers
 * can treat "unparseable" as "missing".
 */
function coerceRuleGroup(doc: unknown): GeneratedRuleGroup | null {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const record = doc as Record<string, unknown>;
  const name = record.name;
  if (typeof name !== 'string' || name.length === 0) return null;

  const rulesRaw = record.rules;
  const rules = Array.isArray(rulesRaw) ? rulesRaw.map(coerceRule).filter(isGeneratedRule) : [];

  return {
    groupName: name,
    interval: parseIntervalSeconds(record.interval),
    rules,
    yaml: '',
  };
}

function isGeneratedRule(rule: GeneratedRule | null): rule is GeneratedRule {
  return rule !== null;
}

/**
 * Coerce the list-namespace response. The ruler's HTTP API answers with the
 * Prometheus envelope `{ status: "success", data: { groups: [ { name, file,
 * interval, rules, ... }, ... ] } }`. Cortex's ruler CRUD admin surface also
 * accepts `{ "<ns>": [ { name, interval, rules }, ... ] }`; some tests feed a
 * top-level array or a single group. Accept all four shapes.
 */
function coerceRuleGroupList(doc: unknown): GeneratedRuleGroup[] {
  if (!doc) return [];
  if (Array.isArray(doc)) {
    return doc.map(coerceRuleGroup).filter(isGeneratedRuleGroup);
  }
  if (typeof doc === 'object') {
    const record = doc as Record<string, unknown>;
    // Prometheus response envelope. `status === 'error'` on a 200 body must
    // not coerce to `[]` — the caller (reconciler / probe) cannot otherwise
    // distinguish "ruler reported an error" from "namespace is empty" and
    // would happily proceed to tear down rules that still exist.
    if (record.status === 'error') {
      const errorType = typeof record.errorType === 'string' ? record.errorType : 'unknown_error';
      const errorMsg = typeof record.error === 'string' ? record.error : '';
      throw new SloRulerError(
        'RULER_VALIDATION_FAILED',
        0,
        `Ruler returned ${errorType}: ${errorMsg}`
      );
    }
    // Prometheus response envelope: `{ data: { groups: [...] } }`.
    const data = record.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const groups = (data as Record<string, unknown>).groups;
      if (Array.isArray(groups)) {
        return groups.map(coerceRuleGroup).filter(isGeneratedRuleGroup);
      }
    }
    // Cortex namespace-keyed envelope: take every array-valued field and
    // flatten — namespaces are already filtered server-side by the URL, so
    // this is safe even if multiple keys appear.
    const fromEnvelope: GeneratedRuleGroup[] = [];
    let sawArrayField = false;
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        sawArrayField = true;
        for (const entry of value) {
          const group = coerceRuleGroup(entry);
          if (group) fromEnvelope.push(group);
        }
      }
    }
    if (sawArrayField) return fromEnvelope;
    // Single-group shape: `{ name, interval, rules }`.
    const single = coerceRuleGroup(doc);
    return single ? [single] : [];
  }
  return [];
}

function isGeneratedRuleGroup(group: GeneratedRuleGroup | null): group is GeneratedRuleGroup {
  return group !== null;
}

function coerceRule(raw: unknown): GeneratedRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const record_ = record.record;
  const alert = record.alert;
  const expr = record.expr;
  if (typeof expr !== 'string') return null;

  let type: 'recording' | 'alerting';
  let name: string;
  if (typeof record_ === 'string' && record_.length > 0) {
    type = 'recording';
    name = record_;
  } else if (typeof alert === 'string' && alert.length > 0) {
    type = 'alerting';
    name = alert;
  } else {
    return null;
  }

  const out: GeneratedRule = {
    type,
    name,
    expr,
    labels: coerceStringMap(record.labels),
    description: '',
  };
  if (typeof record.for === 'string') out.for = record.for;
  const annotations = coerceStringMap(record.annotations);
  if (Object.keys(annotations).length > 0) out.annotations = annotations;
  return out;
}

function coerceStringMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

/**
 * Parse a Prometheus duration like "30s", "1m", "2h" back into seconds.
 * Also accepts a raw number (seconds) in case the transport pre-numerified.
 * Unknown / missing input falls back to 60s — the SLO generator's default.
 */
function parseIntervalSeconds(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== 'string') return 60;
  const match = /^(\d+)([smh])$/.exec(raw.trim());
  if (!match) return 60;
  const n = Number.parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    default:
      return 60;
  }
}

// ============================================================================
// MockRulerClient — dev / test
// ============================================================================

/**
 * No-op ruler client. Used in:
 *   - Unit tests that want to assert SloService ordering without a real transport.
 *   - Dev servers where the SQL plugin isn't reachable.
 *
 * `previewRules()` never touches a ruler client at all (preview is pure), so
 * this mock isn't what powers preview — it's just the "degrade gracefully"
 * companion to DirectQueryRulerClient.
 */
export class MockRulerClient implements RulerClient {
  constructor(private readonly logger: Logger) {}

  async upsertRuleGroup(
    _client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    group: GeneratedRuleGroup
  ): Promise<void> {
    this.logger.debug(
      `MockRuler upsert: ds=${datasource.id} ns=${namespace} group=${group.groupName} rules=${group.rules.length}`
    );
  }

  async deleteRuleGroup(
    _client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<void> {
    this.logger.debug(`MockRuler delete: ds=${datasource.id} ns=${namespace} group=${groupName}`);
  }

  async getRuleGroup(
    _client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<GeneratedRuleGroup | null> {
    this.logger.debug(
      `MockRuler getRuleGroup: ds=${datasource.id} ns=${namespace} group=${groupName} → null`
    );
    return null;
  }

  async listRuleGroups(
    _client: AlertingOSClient,
    datasource: Datasource,
    namespace: string
  ): Promise<GeneratedRuleGroup[]> {
    this.logger.debug(`MockRuler listRuleGroups: ds=${datasource.id} ns=${namespace} → []`);
    return [];
  }
}
