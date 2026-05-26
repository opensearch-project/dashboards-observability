/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Probe each OpenSearch datasource once on mount to confirm the
 * `opensearch-alerting` backend plugin is installed. The Alert Manager has a
 * hard runtime dependency on this plugin (every read/write route proxies
 * `/_plugins/_alerting/...`); without the probe a user with the OSD-side
 * feature flag enabled but a vanilla OpenSearch cluster gets cryptic
 * transport errors at every interaction. With the probe, we can show a
 * single "alerting plugin not detected" callout and avoid noisy errors
 * downstream.
 *
 * Probe target: `GET /destinations`. It's already part of the read surface
 * registered by this plugin and doesn't require write permissions, so it's
 * safe to issue at mount time. We treat any 404/502/transport failure as
 * "unavailable" — the destinations route only returns 200 when the alerting
 * plugin successfully proxied the request.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Datasource } from '../../../../common/types/alerting';
import { coreRefs } from '../../../framework/core_refs';

export interface AlertingAvailabilityResult {
  isLoading: boolean;
  /** All datasources reported a probe failure that looks like a missing plugin. */
  unavailable: boolean;
  /** IDs of datasources that did not respond with a 200 to the probe. */
  unavailableDsIds: string[];
}

const PROBE_TIMEOUT_MS = 10_000;

export function useAlertingPluginAvailability(
  datasources: Datasource[]
): AlertingAvailabilityResult {
  const [isLoading, setIsLoading] = useState(false);
  const [unavailableDsIds, setUnavailableDsIds] = useState<string[]>([]);

  // Stable join of OS datasource ids — only OS datasources participate.
  const osIds = useMemo(
    () =>
      datasources.filter((d) => d.type === 'opensearch' && d.enabled !== false).map((d) => d.id),
    [datasources]
  );
  const osIdsKey = osIds.join('|');

  useEffect(() => {
    const http = coreRefs.http;
    if (!http || osIds.length === 0) {
      setUnavailableDsIds([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const failed: string[] = [];
      await Promise.all(
        osIds.map(async (dsId) => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
          try {
            await http.get(`/api/alerting/opensearch/${encodeURIComponent(dsId)}/destinations`, {
              signal: ctrl.signal,
            });
          } catch {
            failed.push(dsId);
          } finally {
            clearTimeout(timer);
          }
        })
      );
      if (cancelled) return;
      setUnavailableDsIds(failed);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // osIdsKey memoizes the array contents — including osIds directly would
    // re-fire on every parent render due to array-reference churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osIdsKey]);

  return useMemo(
    () => ({
      isLoading,
      unavailable: osIds.length > 0 && unavailableDsIds.length === osIds.length,
      unavailableDsIds,
    }),
    [isLoading, osIds.length, unavailableDsIds]
  );
}
