/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_datasources — client-side hook that sources Alert Manager datasources
 * from the two saved-object types the data-source plugin already registers:
 *
 *   - `data-source`     — MDS OpenSearch clusters (attributes.endpoint is a URL).
 *                         The saved-object ID is used as `mdsId` for scoped-client
 *                         resolution in server routes.
 *   - `data-connection` — DirectQuery connections (Prometheus, CloudWatch, etc.);
 *                         `attributes.connectionId` is the SQL-plugin connection
 *                         name used for `/_plugins/_directquery/_resources/{name}/...`
 *                         routing in DirectQueryPrometheusBackend.
 *
 * This replaces the InMemoryDatasourceService wipe-and-rebuild loop (addresses
 * reviewer comments 8 and 11). Saved-object IDs are stable across server restarts
 * and the client discovery cycle, so user selections persisted in localStorage
 * continue to resolve correctly.
 *
 * Pattern mirrors APM's `use_apm_config.ts` — read the same `data-connection`
 * type for Prometheus, add the parallel `data-source` read for MDS OpenSearch.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SavedObject } from '../../../../../../src/core/public';
import { coreRefs } from '../../../framework/core_refs';
import type { Datasource } from '../../../../common/types/alerting';

// Attribute shapes for the two saved-object types we consume.
// These mirror the server-side types in server/routes/alerting/types.ts so
// both layers agree on the shape even though the saved-object types are
// registered (and owned) by `src/plugins/data_source/`.
interface DataSourceSOAttributes {
  title?: string;
  endpoint?: string;
}

interface DataConnectionSOAttributes {
  connectionId?: string;
  type?: string;
  meta?: Record<string, unknown>;
}

const LOCAL_ENDPOINT_PATTERN = /localhost|127\.0\.0\.1|0\.0\.0\.0|::1|opensearch:9200|opensearch-cluster-master|opensearch-master/i;

/**
 * Map both saved-object types into the unified `Datasource` shape that
 * Alert Manager UI code already consumes. Mirrors server-side mapping in
 * `server/routes/alerting/index.ts::discoverOsdDatasources`.
 */
export function mapSavedObjectsToDatasources(
  osSavedObjects: Array<SavedObject<DataSourceSOAttributes>>,
  dcSavedObjects: Array<SavedObject<DataConnectionSOAttributes>>
): Datasource[] {
  // Partition OS data-source saved objects into "points at local cluster"
  // vs "remote". If the user has created an MDS entry that targets the
  // local cluster, surface their entry (with their chosen title) instead
  // of the hardcoded "Local Cluster" placeholder — avoids showing two rows
  // for the same physical cluster.
  const osLocal = osSavedObjects.filter((so) =>
    LOCAL_ENDPOINT_PATTERN.test(so.attributes?.endpoint || '')
  );
  const osRemote = osSavedObjects.filter(
    (so) => !LOCAL_ENDPOINT_PATTERN.test(so.attributes?.endpoint || '')
  );

  const localRows: Datasource[] =
    osLocal.length > 0
      ? osLocal.map((so) => ({
          id: so.id,
          name: so.attributes.title || so.id,
          type: 'opensearch' as const,
          url: so.id,
          enabled: true,
          mdsId: so.id,
        }))
      : [
          {
            id: 'local',
            name: 'Local Cluster',
            type: 'opensearch' as const,
            url: 'local',
            enabled: true,
          },
        ];

  const osRemoteRows: Datasource[] = osRemote.map((so) => ({
    id: so.id,
    name: so.attributes.title || so.id,
    type: 'opensearch' as const,
    url: so.id,
    enabled: true,
    mdsId: so.id,
  }));

  const promRows: Datasource[] = dcSavedObjects
    .filter((so) => {
      const t = so.attributes?.type;
      return t === 'Prometheus' || t === 'Amazon Managed Prometheus';
    })
    .map((so) => ({
      id: so.id,
      name: so.attributes.connectionId || so.id,
      type: 'prometheus' as const,
      url: so.id,
      enabled: true,
      // SQL-plugin connection name used by DirectQueryPrometheusBackend
      // to route requests through /_plugins/_directquery/_resources/<name>/...
      directQueryName: so.attributes.connectionId,
    }));

  return [...localRows, ...osRemoteRows, ...promRows];
}

export interface UseDatasourcesResult {
  datasources: Datasource[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * React hook — returns the current list of Alert Manager datasources
 * (OpenSearch + Prometheus), sourced from the `data-source` and
 * `data-connection` saved-object types. IDs are stable saved-object IDs,
 * so user selections persisted in localStorage continue to resolve across
 * page loads, server restarts, and discovery refreshes.
 */
export function useDatasources(): UseDatasourcesResult {
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  useEffect(() => {
    const savedObjectsClient = coreRefs.savedObjectsClient;
    if (!savedObjectsClient) {
      setDatasources([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const [osResult, dcResult] = await Promise.all([
          savedObjectsClient.find<DataSourceSOAttributes>({
            type: 'data-source',
            perPage: 100,
          }),
          savedObjectsClient.find<DataConnectionSOAttributes>({
            type: 'data-connection',
            perPage: 100,
          }),
        ]);

        if (cancelled) return;

        const merged = mapSavedObjectsToDatasources(
          osResult.savedObjects as Array<SavedObject<DataSourceSOAttributes>>,
          dcResult.savedObjects as Array<SavedObject<DataConnectionSOAttributes>>
        );

        setDatasources(merged);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setDatasources([]);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return useMemo(() => ({ datasources, isLoading, error, refresh }), [
    datasources,
    isLoading,
    error,
    refresh,
  ]);
}
