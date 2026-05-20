/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hydrates the in-memory datasource registry from OSD saved objects.
 *
 * Historically this lived inside the alerting route module, which meant the
 * registry was only populated when a `/api/alerting/*` request arrived. Other
 * routes that read the registry (notably the SLO CRUD routes) saw an empty
 * map on cold start and rejected `ds-N` lookups as "not registered" — the
 * subsequent browser curl against `/api/alerting/datasources` then hydrated
 * the map, which made the failure look like a phantom: the SLO route saw
 * nothing, but the user's follow-up check showed the datasource present.
 *
 * Extracting the discovery into a shared service lets every consumer hit the
 * same TTL-gated hydration path before reading from the registry.
 */

import type { RequestHandlerContext, SavedObject } from '../../../../../src/core/server';
import type { Logger } from '../../../common/types/alerting/types';
import type { InMemoryDatasourceService } from './datasource_service';

interface DataSourceSOAttributes {
  title?: string;
  endpoint?: string;
}

interface DataConnectionSOAttributes {
  connectionId?: string;
  type?: string;
}

type DiscoveryContext = RequestHandlerContext;

const LOCAL_CLUSTER_PATTERNS = /localhost|127\.0\.0\.1|0\.0\.0\.0|::1|opensearch:9200|opensearch-cluster-master|opensearch-master/i;

export class DatasourceDiscoveryService {
  private lastRunTs = 0;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly datasourceService: InMemoryDatasourceService,
    private readonly logger: Logger | undefined,
    private readonly ttlMs = 30_000
  ) {}

  /**
   * Ensure the datasource registry reflects the current saved-object state.
   * TTL-gated: within `ttlMs`, a non-empty registry is considered fresh and
   * the call is a no-op. Concurrent calls share a single in-flight promise.
   *
   * Swallows saved-object errors on purpose: a discovery failure must not
   * cascade into the caller (e.g., SLO DELETE). Callers that depend on the
   * registry still fail downstream with a typed error if the datasource
   * turns out to be genuinely missing — which is the correct behavior.
   */
  async ensure(ctx: DiscoveryContext): Promise<void> {
    const existing = await this.datasourceService.list();
    if (Date.now() - this.lastRunTs < this.ttlMs && existing.length > 0) return;
    if (this.inflight) {
      await this.inflight;
      return;
    }

    this.inflight = this.run(ctx);
    try {
      await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  private async run(ctx: DiscoveryContext): Promise<void> {
    try {
      // Discover OSD-registered data sources + direct-query data connections.
      // - `data-source` = MDS OpenSearch clusters (attribute.endpoint is a URL).
      // - `data-connection` = direct-query connections (Prometheus, CloudWatch, etc);
      //   attribute.connectionId is the SQL-plugin connection name used for
      //   /_plugins/_directquery/_resources/{connectionId}/... routing.
      const soClient = ctx.core.savedObjects.client;
      const [osResult, dcResult] = await Promise.all([
        soClient.find<DataSourceSOAttributes>({ type: 'data-source', perPage: 100 }),
        soClient.find<DataConnectionSOAttributes>({ type: 'data-connection', perPage: 100 }),
      ]);

      // Partition OS data-source saved objects into "points at local cluster"
      // vs "remote". If the user has created an MDS entry that targets the
      // local cluster, surface their name/entry instead of the hardcoded
      // "Local Cluster" seed — avoids showing two rows for the same cluster.
      const osSavedObjects = osResult.saved_objects || [];
      const osLocal = osSavedObjects.filter((so) =>
        LOCAL_CLUSTER_PATTERNS.test(so.attributes?.endpoint || '')
      );
      const osRemote = osSavedObjects.filter(
        (so) => !LOCAL_CLUSTER_PATTERNS.test(so.attributes?.endpoint || '')
      );

      // Seed a representation for the local cluster:
      //   - If the user registered one or more MDS data sources pointing at
      //     the local cluster, surface them with their user-given names.
      //   - Otherwise, seed the default "Local Cluster" entry.
      if (osLocal.length > 0) {
        this.datasourceService.seed(
          osLocal.map((so: SavedObject<DataSourceSOAttributes>) => ({
            name: so.attributes.title || so.id,
            type: 'opensearch' as const,
            url: so.id,
            enabled: true,
            mdsId: so.id,
          }))
        );
      } else {
        this.datasourceService.seed([
          { name: 'Local Cluster', type: 'opensearch' as const, url: 'local', enabled: true },
        ]);
      }

      const osDiscovered = osRemote.map((so: SavedObject<DataSourceSOAttributes>) => ({
        name: so.attributes.title || so.id,
        type: 'opensearch' as const,
        url: so.id,
        enabled: true,
        mdsId: so.id,
      }));

      const promDiscovered = (dcResult.saved_objects || [])
        .filter((so: SavedObject<DataConnectionSOAttributes>) => {
          const t = so.attributes?.type;
          return t === 'Prometheus' || t === 'Amazon Managed Prometheus';
        })
        .map((so: SavedObject<DataConnectionSOAttributes>) => ({
          name: so.attributes.connectionId || so.id,
          type: 'prometheus' as const,
          url: so.id,
          enabled: true,
          // SQL-plugin connection name used by DirectQueryPrometheusBackend
          // to route requests through /_plugins/_directquery/_resources/<name>/...
          directQueryName: so.attributes.connectionId,
        }));

      // Upsert by stable key so ds-N ids are preserved across refreshes.
      const discovered = [
        { name: 'Local Cluster', type: 'opensearch' as const, url: 'local', enabled: true },
        ...osDiscovered,
        ...promDiscovered,
      ];
      await this.datasourceService.reconcile(discovered);
      this.logger?.info(
        `alerting: Reconciled datasources — ${osDiscovered.length} OpenSearch data source(s), ${promDiscovered.length} Prometheus connection(s)`
      );
      this.lastRunTs = Date.now();
    } catch (e) {
      this.logger?.debug(`alerting: Could not discover OSD data sources: ${e}`);
    }
  }
}
