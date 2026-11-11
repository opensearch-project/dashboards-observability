/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The CloudWatch regions the user reads alarms from. Kept in localStorage (one key shared by
 * both tabs, like the datasource selection) and always limited to the regions the source
 * offers. Each selected region adds one CloudWatch datasource per account scope.
 */
import { useCallback, useMemo, useState } from 'react';
import type { CloudWatchTargets } from '../../../../common/types/alerting';
import { ALERT_MANAGER_CLOUDWATCH_REGIONS_STORAGE_KEY } from '../../../../common/constants/alerting_settings';
import {
  CLOUDWATCH_DATASOURCE_ID,
  decodeCloudWatchDatasourceId,
  encodeCloudWatchDatasourceId,
  isCloudWatchDatasourceId,
  resolveCloudWatchTarget,
} from '../../../../common/services/alerting/cloudwatch_datasource_id';
import { loadPersistedSelection, persistSelection } from '../alarms_page_helpers';

/**
 * The regions in `stored` that the source offers, de-duplicated, in input order. When none are
 * left, the source's default region (or nothing when it has none).
 */
export function sanitizeCloudWatchRegions(stored: unknown, targets?: CloudWatchTargets): string[] {
  if (!targets) return [];
  const offered = new Set(targets.regions.map((r) => r.id));
  const out: string[] = [];
  if (Array.isArray(stored)) {
    for (const r of stored) {
      if (typeof r === 'string' && offered.has(r) && !out.includes(r)) out.push(r);
    }
  }
  if (out.length > 0) return out;
  return targets.defaultRegion ? [targets.defaultRegion] : [];
}

export interface UseCloudWatchRegionsResult {
  selectedRegions: string[];
  setSelectedRegions: (regions: string[]) => void;
}

export function useCloudWatchRegions(targets?: CloudWatchTargets): UseCloudWatchRegionsResult {
  const [stored, setStored] = useState<string[]>(() =>
    loadPersistedSelection(ALERT_MANAGER_CLOUDWATCH_REGIONS_STORAGE_KEY)
  );
  const selectedRegions = useMemo(
    () => sanitizeCloudWatchRegions(stored, targets),
    [stored, targets]
  );
  const setSelectedRegions = useCallback(
    (regions: string[]) => {
      const next = sanitizeCloudWatchRegions(regions, targets);
      setStored(next);
      persistSelection(ALERT_MANAGER_CLOUDWATCH_REGIONS_STORAGE_KEY, next);
    },
    [targets]
  );
  return { selectedRegions, setSelectedRegions };
}

export interface CloudWatchRegionChange {
  targets: CloudWatchTargets;
  prevRegions: string[];
  nextRegions: string[];
  selectedDsIds: string[];
  maxDatasources: number;
}

/**
 * The datasource selection after a region change. A removed region drops every selected
 * CloudWatch id in that region (`cloudwatch` is in the default region). An added region selects
 * its id for every account scope that already has a CloudWatch selection, unless that would go
 * over `maxDatasources`: then nothing is added and `capReached` is set.
 */
export function applyCloudWatchRegionChange({
  targets,
  prevRegions,
  nextRegions,
  selectedDsIds,
  maxDatasources,
}: CloudWatchRegionChange): { selectedDsIds: string[]; capReached: boolean } {
  const removed = new Set(prevRegions.filter((r) => !nextRegions.includes(r)));
  const added = nextRegions.filter((r) => !prevRegions.includes(r));

  const regionOf = (id: string): string | undefined => {
    if (id === CLOUDWATCH_DATASOURCE_ID) return targets.defaultRegion;
    return isCloudWatchDatasourceId(id) ? decodeCloudWatchDatasourceId(id)?.region : undefined;
  };
  const kept = selectedDsIds.filter((id) => {
    const region = regionOf(id);
    return region === undefined || !removed.has(region);
  });

  // The scopes (`undefined` = the default scope) that have a CloudWatch selection.
  const scopes = new Set<string | undefined>();
  for (const id of selectedDsIds) {
    if (!isCloudWatchDatasourceId(id)) continue;
    const decoded = decodeCloudWatchDatasourceId(id);
    if (decoded) scopes.add(decoded.scopeId);
  }
  const additions: string[] = [];
  for (const region of added) {
    for (const scopeId of scopes) {
      const id = encodeCloudWatchDatasourceId({
        scopeId,
        region,
        defaultRegion: targets.defaultRegion,
      });
      if (!id || kept.includes(id) || additions.includes(id)) continue;
      if (!resolveCloudWatchTarget(targets, id)) continue;
      additions.push(id);
    }
  }
  if (additions.length === 0) return { selectedDsIds: kept, capReached: false };
  if (kept.length + additions.length > maxDatasources) {
    return { selectedDsIds: kept, capReached: true };
  }
  return { selectedDsIds: [...kept, ...additions], capReached: false };
}
