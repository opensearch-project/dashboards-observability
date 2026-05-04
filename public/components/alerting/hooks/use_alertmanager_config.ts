/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** use_alertmanager_config — fetch Alertmanager status + parsed YAML config. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AlertmanagerConfigResponse } from '../../../../common/types/alerting';
import { AlertmanagerAdminService } from '../query_services/alertmanager_admin_service';

export interface UseAlertmanagerConfigResult {
  data: AlertmanagerConfigResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useAlertmanagerConfig(dsId: string | undefined): UseAlertmanagerConfigResult {
  const service = useMemo(() => new AlertmanagerAdminService(), []);
  const [data, setData] = useState<AlertmanagerConfigResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const refetch = useCallback(() => setLocalRefresh((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await service.getConfig(dsId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [service, dsId, localRefresh]);

  return { data, isLoading, error, refetch };
}
