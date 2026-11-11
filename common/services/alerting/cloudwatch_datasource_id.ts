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
 * The datasource name: `CloudWatch · <scope label> · <region>`. The default datasource of a
 * source that doesn't label its default scope keeps today's name, `CloudWatch`. Names must be
 * unique, since per-datasource errors and warnings are keyed by name.
 */
export function cloudWatchDatasourceName(
  id: string,
  scope: CloudWatchAccountScope,
  region?: string
): string {
  if (id === CLOUDWATCH_DATASOURCE_ID && scope.label === CLOUDWATCH_DEFAULT_SCOPE_LABEL) {
    return CLOUDWATCH_DEFAULT_SCOPE_LABEL;
  }
  return ['CloudWatch', scope.label, region].filter(Boolean).join(NAME_SEPARATOR);
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
  return {
    id,
    name: cloudWatchDatasourceName(id, scope, region),
    type: 'cloudwatch',
    url: 'cloudwatch',
    enabled: true,
    ...(region !== undefined ? { region } : {}),
    ...(scope.id !== undefined ? { cloudWatchScope: scope.id } : {}),
    cloudWatchScopeLabel: scope.label,
    ...(scope.accountId !== undefined ? { accountId: scope.accountId } : {}),
  };
}

/**
 * The datasources for the selected regions: per scope, one per selected region plus the scope's
 * default region, in `targets.regions` order. When the source reports no regions, one per scope
 * at its default region.
 */
export function cloudWatchDatasourcesFor(
  targets: CloudWatchTargets,
  selectedRegions: string[]
): Datasource[] {
  const selected = new Set(selectedRegions);
  const out: Datasource[] = [];
  const seen = new Set<string>();
  for (const scope of targets.scopes) {
    const home = scope.defaultRegion ?? targets.defaultRegion;
    const regions: Array<string | undefined> =
      targets.regions.length === 0
        ? [home]
        : targets.regions.map((r) => r.id).filter((r) => selected.has(r) || r === home);
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
