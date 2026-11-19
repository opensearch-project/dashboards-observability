/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Which Prometheus connection an SLO's charts query.
 *
 * An SLO stores the datasource it was created on in `spec.datasourceId`, in any
 * of the three equivalent forms (the datasource id, its display name, or its
 * DirectQuery connection name; see common/slo/slo_datasource_ref.ts). Its
 * charts must read that same datasource: the APM settings' Prometheus source
 * can be a different one, or not be set at all in a workspace that has SLOs but
 * no APM configuration. The APM source stays the fallback when the SLO's
 * datasource isn't in the list (for example, it was removed).
 */

import { useMemo } from 'react';
import type { Datasource } from '../../../../../common/types/alerting';
import { refFromDatasource } from '../../../../../common/slo/slo_datasource_ref';
import { useDatasources } from '../../../alerting/hooks/use_datasources';
import { useApmConfig } from '../../config/apm_config_context';

/** Where the connection came from: the SLO's own datasource, the APM settings, or nowhere. */
export type SloConnectionSource = 'slo' | 'apm' | 'none';

export interface ResolvedSloConnection {
  /** The Prometheus connection name the PromQL search takes as its dataset id; '' when none. */
  connectionId: string;
  source: SloConnectionSource;
}

export interface SloPrometheusConnection extends ResolvedSloConnection {
  /** True while the datasource list is loading and the answer could still change. */
  loading: boolean;
}

/**
 * Resolve the SLO's Prometheus connection from the datasource list, falling
 * back to the APM settings' connection. Pure, for tests.
 */
export function resolveSloPrometheusConnection(
  datasourceId: string | undefined,
  datasources: readonly Datasource[],
  apmConnectionId: string | undefined
): ResolvedSloConnection {
  const ref = datasourceId?.trim();
  if (ref) {
    // The same id forms the SLO routes accept (common/slo/slo_datasource_ref.ts).
    const ds = datasources.find(
      (d) => d.type === 'prometheus' && refFromDatasource(d).forms.includes(ref)
    );
    const connectionId = ds?.directQueryName || ds?.name;
    if (connectionId) return { connectionId, source: 'slo' };
  }
  if (apmConnectionId) return { connectionId: apmConnectionId, source: 'apm' };
  return { connectionId: '', source: 'none' };
}

/** The connection an SLO's charts should query (see the module comment). */
export function useSloPrometheusConnection(
  datasourceId: string | undefined
): SloPrometheusConnection {
  const { config, loading: apmLoading } = useApmConfig();
  const { datasources, isLoading } = useDatasources();
  const apmConnectionId = config?.prometheusDataSource?.name;
  return useMemo(() => {
    const resolved = resolveSloPrometheusConnection(datasourceId, datasources, apmConnectionId);
    // Until both lists are in, a fallback (or "none") could still turn into the SLO's own
    // connection, so don't let the charts query a source they may have to drop.
    if (resolved.source !== 'slo' && (isLoading || apmLoading)) {
      return { connectionId: '', source: 'none', loading: true };
    }
    return { ...resolved, loading: false };
  }, [datasourceId, datasources, apmConnectionId, isLoading, apmLoading]);
}
