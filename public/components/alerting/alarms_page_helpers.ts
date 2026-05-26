/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure helpers extracted from `alarms_page.tsx`. Kept in a `.ts` file (no
 * JSX) so they can be unit-tested in isolation and the page component
 * stays focused on orchestration / state.
 *
 * Contents:
 *   - localStorage / sessionStorage round-trippers for selection and
 *     time-range (graceful when storage is unavailable).
 *   - `resolveDatasourceTokens` — case-insensitive lookup of user-supplied
 *     names/ids against the loaded datasource list.
 *   - `isAlertingConfigMissingError` — pattern match for the
 *     `.opendistro-alerting-config` index-not-found error.
 *   - `formStateToRule` — pure transform from a create-monitor form state
 *     to a UnifiedRule, used for optimistic insertion into the rules list.
 *
 * Constants are exported so the page can import them by name.
 */
import type { Datasource, UnifiedRule } from '../../../common/types/alerting';
import type { MonitorFormState } from './create_monitor';

// =========================================================================
// Selection persistence
// =========================================================================

export const ALERT_MANAGER_SELECTED_DS_STORAGE_KEY_DEFAULT = 'AlertManagerSelectedDatasources';

export function loadPersistedSelection(storageKey: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch (_e) {
    return [];
  }
}

export function persistSelection(storageKey: string, names: string[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(names));
  } catch (_e) {
    // localStorage can be unavailable (private mode / quota). Not fatal.
  }
}

// =========================================================================
// Time-range persistence
// =========================================================================
//
// Keyed in sessionStorage (not localStorage) so each tab keeps its own
// picked range — mirrors APM's precedent. Falls back to the default
// (`now-24h` → `now`) when the key is absent or the underlying storage
// throws (SSR, private mode, quota exceeded).

export const ALERT_MANAGER_START_TIME_KEY = 'AlertManagerStartTime';
export const ALERT_MANAGER_END_TIME_KEY = 'AlertManagerEndTime';
export const DEFAULT_START_TIME = 'now-24h';
export const DEFAULT_END_TIME = 'now';

export function loadPersistedStartTime(): string {
  try {
    return window.sessionStorage.getItem(ALERT_MANAGER_START_TIME_KEY) || DEFAULT_START_TIME;
  } catch (_e) {
    return DEFAULT_START_TIME;
  }
}

export function loadPersistedEndTime(): string {
  try {
    return window.sessionStorage.getItem(ALERT_MANAGER_END_TIME_KEY) || DEFAULT_END_TIME;
  } catch (_e) {
    return DEFAULT_END_TIME;
  }
}

export function persistTimeRange(start: string, end: string) {
  try {
    window.sessionStorage.setItem(ALERT_MANAGER_START_TIME_KEY, start);
    window.sessionStorage.setItem(ALERT_MANAGER_END_TIME_KEY, end);
  } catch (_e) {
    // sessionStorage can be unavailable (SSR / private mode / quota). Not fatal.
  }
}

// =========================================================================
// Datasource token resolution
// =========================================================================

/**
 * Resolve an array of user-supplied tokens (names or ids) against the loaded
 * datasource list, returning the matched datasource ids in input order, with
 * duplicates removed. Unknown tokens are dropped silently — the setting
 * accepts free strings, so typos shouldn't block the page.
 *
 * Matching is case-insensitive and probes every stable handle we expose
 * on a Datasource: id (ds-N, churns across discovery passes — accepted
 * for in-session compatibility but not reliable across restarts), name,
 * directQueryName (stable SQL-plugin connection name for Prom), and
 * mdsId (stable saved-object id for MDS OpenSearch datasources).
 */
export function resolveDatasourceTokens(tokens: string[], datasources: Datasource[]): string[] {
  const lookup = new Map<string, string>();
  const add = (key: string | undefined, id: string) => {
    if (!key) return;
    const k = key.toLowerCase();
    if (!lookup.has(k)) lookup.set(k, id);
  };
  for (const d of datasources) {
    add(d.id, d.id);
    add(d.name, d.id);
    add(d.directQueryName, d.id);
    add(d.mdsId, d.id);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (typeof t !== 'string') continue;
    const id = lookup.get(t.trim().toLowerCase());
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// =========================================================================
// Error classification
// =========================================================================

/**
 * Pattern match for the alerting plugin's "config index missing" first-run
 * state. The plugin lazily creates `.opendistro-alerting-config` on the
 * first monitor save; until then any list call yields an
 * `index_not_found_exception` whose message we normalize for the empty
 * state in the Rules tab.
 */
export const isAlertingConfigMissingError = (err: string | undefined): boolean => {
  if (!err) return false;
  return (
    err.includes('.opendistro-alerting-config') &&
    (err.includes('index_not_found') ||
      err.includes('IndexNotFoundException') ||
      err.includes('alerting_exception'))
  );
};

// =========================================================================
// Form-state → UnifiedRule transform (optimistic insert)
// =========================================================================

/**
 * Pure transform from a create-monitor form to a `UnifiedRule` shape, used
 * to optimistically insert a row at the top of the Rules table while the
 * server PUT is in flight. The optimistic row is replaced once
 * `fetchRules` round-trips with the canonical server-assigned id.
 *
 * `fallbackDsId` is consulted when the form state didn't carry an explicit
 * `datasourceId` — typically the first selected datasource.
 */
export function formStateToRule(
  formState: MonitorFormState,
  fallbackDsId: string,
  index = 0
): UnifiedRule {
  const now = new Date().toISOString();

  if (formState.datasourceType === 'prometheus') {
    const labelsObj: Record<string, string> = {};
    for (const l of formState.labels) {
      if (l.key && l.value) labelsObj[l.key] = l.value;
    }
    const annotationsObj: Record<string, string> = {};
    for (const a of formState.annotations) {
      if (a.key && a.value) annotationsObj[a.key] = a.value;
    }
    return {
      id: `new-${Date.now()}-${index}`,
      datasourceId: formState.datasourceId || fallbackDsId,
      datasourceType: 'prometheus',
      name: formState.name,
      enabled: formState.enabled,
      severity: formState.severity,
      query: formState.query,
      condition: `${formState.threshold.operator} ${formState.threshold.value}${formState.threshold.unit}`,
      labels: labelsObj,
      annotations: annotationsObj,
      monitorType: 'metric',
      status: formState.enabled ? 'active' : 'disabled',
      healthStatus: 'healthy',
      createdBy: 'current-user',
      createdAt: now,
      lastModified: now,
      notificationDestinations: [],
      description: annotationsObj.description || '',
      evaluationInterval: formState.evaluationInterval,
      pendingPeriod: formState.pendingPeriod,
      firingPeriod: formState.firingPeriod,
      threshold: {
        operator: formState.threshold.operator,
        value: formState.threshold.value,
        unit: formState.threshold.unit,
      },
      alertHistory: [],
      conditionPreviewData: [],
      notificationRouting: [],
      suppressionRules: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw field is empty for new monitors
      raw: {} as any,
    };
  }

  // OpenSearch PPL monitor — DSL/cluster-metrics aren't authored in this UI.
  const indices = formState.indices.map((s) => s.trim()).filter(Boolean);

  const labelsObj: Record<string, string> = {};
  const annotationsObj: Record<string, string> = {};
  for (const l of formState.labels) {
    if (l.key && l.value) labelsObj[l.key] = l.value;
  }
  for (const a of formState.annotations) {
    if (a.key && a.value) annotationsObj[a.key] = a.value;
  }
  if (indices.length > 0) labelsObj.indices = indices.join(', ');
  // monitorType already lives on UnifiedRule as a top-level field — emitting
  // it as a label too would leak into the Labels facet.

  return {
    id: `new-${Date.now()}-${index}`,
    datasourceId: formState.datasourceId || fallbackDsId,
    datasourceType: 'opensearch',
    name: formState.name,
    enabled: formState.enabled,
    severity: formState.severity,
    query: formState.query,
    condition: `${formState.threshold.operator} ${formState.threshold.value}${formState.threshold.unit}`,
    labels: labelsObj,
    annotations: annotationsObj,
    monitorType: 'ppl',
    status: formState.enabled ? 'active' : 'disabled',
    healthStatus: 'healthy',
    createdBy: 'current-user',
    createdAt: now,
    lastModified: now,
    notificationDestinations: [],
    description: `OpenSearch PPL monitor${indices.length > 0 ? ` on ${indices.join(', ')}` : ''}`,
    evaluationInterval: formState.evaluationInterval,
    pendingPeriod: formState.pendingPeriod,
    threshold: {
      operator: formState.threshold.operator,
      value: formState.threshold.value,
      unit: formState.threshold.unit,
    },
    alertHistory: [],
    conditionPreviewData: [],
    notificationRouting: [],
    suppressionRules: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw field is empty for new monitors
    raw: {} as any,
  };
}
