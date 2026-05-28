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
import type { Logger } from '../../../common/types/alerting';
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

      // Local-cluster representation:
      //   - If the user registered any MDS data sources, surface them all with
      //     their user-given names — including any that may point at the local
      //     cluster. The MDS framework already owns the local-cluster identity;
      //     classifying by endpoint substring is fragile (load balancers, VPNs,
      //     custom hostnames) and produced false positives in practice.
      //   - If no MDS rows exist, emit the default "Local Cluster" sentinel so
      //     the alert-manager UI still has at least one OpenSearch target to
      //     bind to on a non-MDS deployment.
      // `reconcile` (not `seed`) preserves stable keys across TTL refreshes.
      const osSavedObjects = osResult.saved_objects || [];
      const osDiscovered = osSavedObjects.map((so: SavedObject<DataSourceSOAttributes>) => ({
        name: so.attributes.title || so.id,
        type: 'opensearch' as const,
        url: so.id,
        enabled: true,
        mdsId: so.id as string | undefined,
      }));
      const localDiscovered =
        osDiscovered.length > 0
          ? []
          : [
              {
                name: 'Local Cluster',
                type: 'opensearch' as const,
                url: 'local',
                enabled: true,
                mdsId: undefined as string | undefined,
              },
            ];

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
      const discovered = [...localDiscovered, ...osDiscovered, ...promDiscovered];
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
