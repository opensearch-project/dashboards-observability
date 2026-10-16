/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fetch the full `CloudWatchAlarmDetail` for the CloudWatch alarm flyout.
 * Mirrors `useMonitorDetail`: instantiate the service once, re-run on
 * dsId/alarmName change, guard against stale writes after unmount, and surface
 * a hard error separately from the (independently-degradable) detail sections.
 *
 * The detail endpoint already loads history / metric-preview / relationships
 * independently server-side and degrades each on partial permission, so the
 * flyout gets one payload with per-section presence flags — a single slow AWS
 * call can't blank the flyout.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CloudWatchAlarmDetail } from '../../../../common/types/alerting';
import type { ClassifiedError } from '../../../../common/error';
import { extractClassifiedError } from '../../common/error';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';

export interface UseCloudWatchAlarmDetailParams {
  dsId: string;
  alarmName: string;
}

export interface UseCloudWatchAlarmDetailResult {
  detail: CloudWatchAlarmDetail | null;
  isLoading: boolean;
  error: Error | null;
  /**
   * Structured classification of the failure when the server attached one
   * (`errorDetail` from the classified CloudWatch routes) — names the failure
   * class (expired session, missing permission, unreachable region, …) with
   * remediation and safe diagnostics. Null when the error is unclassified.
   */
  classifiedError: ClassifiedError | null;
  /** Re-run the fetch (Retry button in the flyout's error state). */
  retry: () => void;
}

export function useCloudWatchAlarmDetail({
  dsId,
  alarmName,
}: UseCloudWatchAlarmDetailParams): UseCloudWatchAlarmDetailResult {
  const service = useMemo(() => new AlertingOpenSearchService(), []);
  const [detail, setDetail] = useState<CloudWatchAlarmDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [classifiedError, setClassifiedError] = useState<ClassifiedError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setDetail(null);
    setIsLoading(true);
    setError(null);
    setClassifiedError(null);
    service
      .getCloudWatchAlarmDetail(dsId, alarmName, { signal: controller.signal })
      .then((data: CloudWatchAlarmDetail) => {
        if (!cancelled && data) setDetail(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        console.error('Failed to load CloudWatch alarm detail:', err);
        setClassifiedError(extractClassifiedError(err));
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dsId, alarmName, service, attempt]);

  return { detail, isLoading, error, classifiedError, retry };
}
