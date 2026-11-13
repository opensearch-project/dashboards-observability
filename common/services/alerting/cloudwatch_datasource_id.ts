/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CloudWatch datasource ids: one virtual datasource per (account scope, region) pair the
 * CloudWatch source offers. Shared by the server (datasource listing and lookup) and the browser
 * (datasource rows for the selected regions), so both sides build the same ids and names.
 *
 * | Id                              | Meaning                                            |
 * |---------------------------------|----------------------------------------------------|
 * | `cloudwatch`                    | default scope, default region (kept for persisted  |
 * |                                 | selections and sources without `listTargets`)      |
 * | `cloudwatch_<region>`           | default scope, `<region>`                          |
 * | `cloudwatch_<region>_<scopeId>` | scope `<scopeId>`, `<region>`                      |
 *
 * Neither a region nor a scope id contains `_`, so the split is unambiguous. Each pair has
 * exactly one id: (default scope, default region) is always `cloudwatch`.
 *
 * Pure, framework-free: safe to import from either side.
 */
import type { CloudWatchAccountScope, CloudWatchTargets, Datasource } from '../../types/alerting';
import { ALERT_MANAGER_MAX_CLOUDWATCH_PAIRS } from '../../constants/alerting_settings';

/** The id of the default scope in the default region (and of today's single datasource). */
export const CLOUDWATCH_DATASOURCE_ID = 'cloudwatch';

/** Label of the source's default scope when the source doesn't name it. */
export const CLOUDWATCH_DEFAULT_SCOPE_LABEL = 'CloudWatch';

const ID_PREFIX = `${CLOUDWATCH_DATASOURCE_ID}_`;
const NAME_SEPARATOR = ' · ';

/** An AWS region code, e.g. `us-east-1` or `us-gov-west-1`. */
export const CLOUDWATCH_REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d+$/;

/** An account scope id: opaque, no `_`, at most 64 characters. */
export const CLOUDWATCH_SCOPE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** True for any CloudWatch datasource id (`cloudwatch` or `cloudwatch_…`). */
export function isCloudWatchDatasourceId(id: string | undefined | null): boolean {
  return typeof id === 'string' && (id === CLOUDWATCH_DATASOURCE_ID || id.startsWith(ID_PREFIX));
}

/**
 * The id for a (scope, region) pair. No scope id means the default scope. Undefined when a part
 * is invalid, or when a non-default scope has no region to encode.
 */
export function encodeCloudWatchDatasourceId(parts: {
  scopeId?: string;
  region?: string;
  defaultRegion?: string;
}): string | undefined {
  const { scopeId, region, defaultRegion } = parts;
  if (region !== undefined && !CLOUDWATCH_REGION_PATTERN.test(region)) return undefined;
  if (scopeId === undefined) {
    if (region === undefined || region === defaultRegion) return CLOUDWATCH_DATASOURCE_ID;
    return `${ID_PREFIX}${region}`;
  }
  if (!CLOUDWATCH_SCOPE_ID_PATTERN.test(scopeId) || region === undefined) return undefined;
  return `${ID_PREFIX}${region}_${scopeId}`;
}

/**
 * The parts of a CloudWatch datasource id: `{}` for `cloudwatch`, else the region and, for a
 * non-default scope, the scope id. Undefined when the id isn't a valid CloudWatch id.
 */
export function decodeCloudWatchDatasourceId(
  id: string
): { region?: string; scopeId?: string } | undefined {
  if (id === CLOUDWATCH_DATASOURCE_ID) return {};
  if (typeof id !== 'string' || !id.startsWith(ID_PREFIX)) return undefined;
  const parts = id.slice(ID_PREFIX.length).split('_');
  if (parts.length > 2) return undefined;
  const [region, scopeId] = parts;
  if (!CLOUDWATCH_REGION_PATTERN.test(region)) return undefined;
  if (scopeId === undefined) return { region };
  if (!CLOUDWATCH_SCOPE_ID_PATTERN.test(scopeId)) return undefined;
  return { region, scopeId };
}

/**
 * The (scope, region) pair an id names, when the source offers it: the region is one of
 * `targets.regions` (`cloudwatch` takes `targets.defaultRegion`), the scope is one of
 * `targets.scopes`, and the id is the pair's canonical id. Undefined otherwise.
 */
export function resolveCloudWatchTarget(
  targets: CloudWatchTargets,
  id: string
): { scope: CloudWatchAccountScope; region?: string } | undefined {
  const decoded = decodeCloudWatchDatasourceId(id);
  if (!decoded) return undefined;
  const region = decoded.region ?? targets.defaultRegion;
  // No region at all only happens when the source reports none; it then uses its own default.
  if (region !== undefined && !targets.regions.some((r) => r.id === region)) return undefined;
  const scope = decoded.scopeId
    ? targets.scopes.find((s) => s.id === decoded.scopeId)
    : targets.scopes.find((s) => !s.id);
  if (!scope) return undefined;
  const canonical = encodeCloudWatchDatasourceId({
    scopeId: scope.id,
    region,
    defaultRegion: targets.defaultRegion,
  });
  return canonical === id ? { scope, region } : undefined;
}

/**
 * The label shown for a scope. A label that repeats among `targets.scopes` gets the account id
 * appended, e.g. `Prod (123456789012)`, or the scope id when the source returned no account id
 * (or the account id repeats too), e.g. `Prod (s2)`. Labels that don't repeat are unchanged.
 *
 * The default label (`CloudWatch`) is the datasource type, so it is checked on the raw label
 * first: the default scope labelled `CloudWatch` is never decorated (it keeps today's names), and
 * any other scope labelled `CloudWatch` that needs telling apart shows the account id or scope id
 * alone, e.g. `123456789012`, rather than `CloudWatch (123456789012)`. A decorated label is
 * therefore never the default label.
 */
export function cloudWatchScopeDisplayLabel(
  targets: CloudWatchTargets,
  scope: CloudWatchAccountScope
): string {
  const isDefaultLabel = scope.label === CLOUDWATCH_DEFAULT_SCOPE_LABEL;
  if (isDefaultLabel && scope.id === undefined) return scope.label;
  const sameLabel = targets.scopes.filter((s) => s.label === scope.label);
  if (sameLabel.length < 2) return scope.label;
  const accountIdIsUnique =
    scope.accountId !== undefined &&
    sameLabel.filter((s) => s.accountId === scope.accountId).length === 1;
  const suffix = accountIdIsUnique ? scope.accountId : (scope.id ?? 'default');
  return isDefaultLabel ? `${suffix}` : `${scope.label} (${suffix})`;
}

/**
 * The datasource name: `CloudWatch · <scope label> · <region>`, without the scope label when it
 * is the default label (so `CloudWatch · us-west-2`, not `CloudWatch · CloudWatch · us-west-2`).
 * The default datasource of a source that doesn't label its default scope keeps today's name,
 * `CloudWatch`. Pass the scope's display label (`cloudWatchScopeDisplayLabel`): it makes repeated
 * labels distinct, so each (scope, region) pair has a distinct name, and it leaves the default
 * label undecorated only where it doesn't repeat or belongs to the default scope, so the checks
 * below see the same default label the raw scope had.
 */
export function cloudWatchDatasourceName(
  id: string,
  scope: CloudWatchAccountScope,
  region?: string
): string {
  if (id === CLOUDWATCH_DATASOURCE_ID && scope.label === CLOUDWATCH_DEFAULT_SCOPE_LABEL) {
    return CLOUDWATCH_DEFAULT_SCOPE_LABEL;
  }
  const label = scope.label === CLOUDWATCH_DEFAULT_SCOPE_LABEL ? undefined : scope.label;
  return ['CloudWatch', label, region].filter(Boolean).join(NAME_SEPARATOR);
}

/** The datasource for a (scope, region) pair, or undefined when the source doesn't offer it. */
export function buildCloudWatchDatasource(
  targets: CloudWatchTargets,
  scope: CloudWatchAccountScope,
  region?: string
): Datasource | undefined {
  const id = encodeCloudWatchDatasourceId({
    scopeId: scope.id,
    region,
    defaultRegion: targets.defaultRegion,
  });
  if (!id || resolveCloudWatchTarget(targets, id)?.scope !== scope) return undefined;
  const label = cloudWatchScopeDisplayLabel(targets, scope);
  return {
    id,
    name: cloudWatchDatasourceName(id, { ...scope, label }, region),
    type: 'cloudwatch',
    url: 'cloudwatch',
    enabled: true,
    ...(region !== undefined ? { region } : {}),
    ...(scope.id !== undefined ? { cloudWatchScope: scope.id } : {}),
    cloudWatchScopeLabel: label,
    ...(scope.accountId !== undefined ? { accountId: scope.accountId } : {}),
  };
}

/**
 * The datasources for the selected regions: per scope, one per selected region, in
 * `targets.regions` order. With no offered region selected (or none reported by the source),
 * one per scope at its default region. The server listing and the browser both use this, with
 * `[targets.defaultRegion]` when nothing else is selected, so a scope's own `defaultRegion` only
 * applies when the source reports no offered shared default.
 */
export function cloudWatchDatasourcesFor(
  targets: CloudWatchTargets,
  selectedRegions: string[]
): Datasource[] {
  const selected = new Set(selectedRegions);
  const picked = targets.regions.map((r) => r.id).filter((r) => selected.has(r));
  const out: Datasource[] = [];
  const seen = new Set<string>();
  for (const scope of targets.scopes) {
    const home = scope.defaultRegion ?? targets.defaultRegion;
    const regions: Array<string | undefined> = picked.length === 0 ? [home] : picked;
    for (const region of regions) {
      const ds = buildCloudWatchDatasource(targets, scope, region);
      if (ds && !seen.has(ds.id)) {
        seen.add(ds.id);
        out.push(ds);
      }
    }
  }
  return out;
}

/**
 * The account scope a CloudWatch datasource id belongs to: `''` for the default scope
 * (`cloudwatch`, `cloudwatch_<region>`), else the scope id. Undefined for any other id.
 */
export function cloudWatchScopeKeyOf(id: string): string | undefined {
  if (!isCloudWatchDatasourceId(id)) return undefined;
  const decoded = decodeCloudWatchDatasourceId(id);
  // An undecodable `cloudwatch_…` id is its own scope, so it still counts once.
  if (!decoded) return id;
  return decoded.scopeId ?? '';
}

/**
 * How many datasources a selection counts toward `observability:alertManagerMaxDatasources`:
 * each OpenSearch or Prometheus datasource counts once, and each CloudWatch account scope counts
 * once however many of its regions are selected.
 */
export function countTowardDatasourceCap(ids: string[]): number {
  const keys = new Set<string>();
  for (const id of ids) {
    const scope = cloudWatchScopeKeyOf(id);
    keys.add(scope === undefined ? `ds:${id}` : `cw:${scope}`);
  }
  return keys.size;
}

/** How many CloudWatch (account scope, region) datasources a selection has. */
export function countCloudWatchPairs(ids: string[]): number {
  return new Set(ids.filter((id) => isCloudWatchDatasourceId(id))).size;
}

/**
 * The ids, in input order, that fit the cap: an id is kept when the selection so far still
 * counts at most `max` (see `countTowardDatasourceCap`) and has at most `maxPairs` CloudWatch
 * datasources. A region of an already kept CloudWatch account always fits the cap.
 */
export function clampToDatasourceCap(
  ids: string[],
  max: number,
  maxPairs: number = ALERT_MANAGER_MAX_CLOUDWATCH_PAIRS
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (out.includes(id)) continue;
    const next = [...out, id];
    if (countTowardDatasourceCap(next) > max) continue;
    if (countCloudWatchPairs(next) > maxPairs) continue;
    out.push(id);
  }
  return out;
}
