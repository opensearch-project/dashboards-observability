/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The account scopes and regions the CloudWatch source offers, read once per page load and
 * shared by every caller. Undefined while CloudWatch is off, while loading, or when the read
 * failed; callers then keep today's single CloudWatch datasource. Only a successful read is
 * cached: after a failure, the next mount (or `reload()`) reads again.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CloudWatchTargets } from '../../../../common/types/alerting';
import { coreRefs } from '../../../framework/core_refs';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';

export interface UseCloudWatchTargetsResult {
  targets?: CloudWatchTargets;
  isLoading: boolean;
  /** True when CloudWatch is on and the last read failed. */
  failed: boolean;
  /** Reads the targets again. A successful read is cached, so this only reads after a failure. */
  reload: () => void;
}

interface TargetsRead {
  targets?: CloudWatchTargets;
  failed: boolean;
}

let cachedTargets: Promise<TargetsRead> | undefined;

function loadCloudWatchTargets(): Promise<TargetsRead> {
  if (!cachedTargets) {
    cachedTargets = new AlertingOpenSearchService().getCloudWatchTargets().then(
      (targets) => ({ targets, failed: false }),
      (err) => {
        // The HTTP status only: the response body may carry provider text.
        const status = err?.response?.status ?? err?.body?.statusCode;
        console.warn('CloudWatch targets are not available; status:', status);
        cachedTargets = undefined;
        return { targets: undefined, failed: true };
      }
    );
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
  const [failed, setFailed] = useState(false);
  const [readToken, setReadToken] = useState(0);
  const reload = useCallback(() => setReadToken((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) {
      setTargets(undefined);
      setIsLoading(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setFailed(false);
    loadCloudWatchTargets().then((result) => {
      if (cancelled) return;
      setTargets(result.targets);
      setFailed(result.failed);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, readToken]);

  return useMemo(
    () =>
      enabled
        ? { targets, isLoading, failed, reload }
        : { targets: undefined, isLoading: false, failed: false, reload },
    [enabled, targets, isLoading, failed, reload]
  );
}
