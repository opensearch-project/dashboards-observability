/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The account scopes and regions the CloudWatch source offers, read once per page load and
 * shared by every caller. Undefined while CloudWatch is off, while loading, or when the read
 * failed; callers then keep today's single CloudWatch datasource.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CloudWatchTargets } from '../../../../common/types/alerting';
import { coreRefs } from '../../../framework/core_refs';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';

export interface UseCloudWatchTargetsResult {
  targets?: CloudWatchTargets;
  isLoading: boolean;
}

let cachedTargets: Promise<CloudWatchTargets | undefined> | undefined;

function loadCloudWatchTargets(): Promise<CloudWatchTargets | undefined> {
  if (!cachedTargets) {
    cachedTargets = new AlertingOpenSearchService().getCloudWatchTargets().catch((err) => {
      // The HTTP status only: the response body may carry provider text.
      const status = err?.response?.status ?? err?.body?.statusCode;
      console.warn('CloudWatch targets are not available; status:', status);
      return undefined;
    });
  }
  return cachedTargets;
}

/** Clears the per-page-load cache. Tests only. */
export function __resetCloudWatchTargetsCacheForTests() {
  cachedTargets = undefined;
}

export function useCloudWatchTargets(): UseCloudWatchTargetsResult {
  const enabled = !!coreRefs.cloudwatchEnabled;
  const [targets, setTargets] = useState<CloudWatchTargets | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setTargets(undefined);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    loadCloudWatchTargets().then((result) => {
      if (cancelled) return;
      setTargets(result);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return useMemo(
    () => (enabled ? { targets, isLoading } : { targets: undefined, isLoading: false }),
    [enabled, targets, isLoading]
  );
}
