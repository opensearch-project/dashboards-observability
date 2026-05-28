/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import type { HttpStart } from '../../../../../../../src/core/public';
import type { Datasource } from '../../../../../common/types/alerting';
import { useDatasources } from '../../../alerting/hooks/use_datasources';

interface PrometheusDatasourcesState {
  datasources: Datasource[];
  loading: boolean;
  error: Error | null;
}

/**
 * Returns the registered Prometheus connections, sourced from the
 * `data-connection` saved-object type via Alert Manager's shared
 * `useDatasources` hook. Used by the SLO listing's datasource facet so
 * the catalog shown there stays consistent with Alert Manager's view.
 *
 * The `http` arg is preserved for backward-compat with existing callers
 * but no longer used — the saved-object client comes from the
 * framework's `coreRefs` singleton inside `useDatasources`.
 */
export function usePrometheusDatasources(_http: HttpStart): PrometheusDatasourcesState {
  const { datasources, isLoading, error } = useDatasources();
  return useMemo(
    () => ({
      datasources: datasources
        .filter((d) => d.type === 'prometheus' && d.enabled !== false)
        .sort((a, b) => a.name.localeCompare(b.name)),
      loading: isLoading,
      error,
    }),
    [datasources, isLoading, error]
  );
}
