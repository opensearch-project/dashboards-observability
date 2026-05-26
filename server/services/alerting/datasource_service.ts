/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Datasource service — manages alert datasource configurations
 */
import {
  AlertingOSClient,
  Datasource,
  DatasourceService,
  PrometheusBackend,
  Logger,
} from '../../../common/types/alerting';

/**
 * Identity key used by the discovery reconciler to match a freshly-fetched
 * datasource against an existing one so the numeric `ds-N` id stays stable
 * across refreshes (see `reconcile`). Stable across process lifetime because
 * all three inputs come from saved objects, not the counter.
 */
function stableKey(input: Pick<Datasource, 'type' | 'url' | 'mdsId' | 'directQueryName'>): string {
  if (input.mdsId) return `mds:${input.mdsId}`;
  if (input.directQueryName) return `dq:${input.directQueryName}`;
  // Local-cluster sentinel (`type=opensearch, url=local`) has no mdsId/dqName;
  // key on type+url so it remains the same entry across refreshes.
  return `raw:${input.type}:${input.url}`;
}

export class InMemoryDatasourceService implements DatasourceService {
  private datasources: Map<string, Datasource> = new Map();
  /** Reverse index: stableKey → datasource id. Maintained by `create`/`delete`/`reconcile`. */
  private idByStableKey: Map<string, string> = new Map();
  private counter = 0;
  private promBackend?: PrometheusBackend;

  constructor(private readonly logger: Logger) {}

  setPrometheusBackend(backend: PrometheusBackend): void {
    this.promBackend = backend;
  }

  async list(): Promise<Datasource[]> {
    return Array.from(this.datasources.values());
  }

  async get(id: string): Promise<Datasource | null> {
    const direct = this.datasources.get(id);
    if (direct) return direct;
    // Discovered Prometheus connections are keyed under auto-generated
    // `ds-N` IDs but callers may pass the SQL-plugin `connectionId`
    // captured as `directQueryName`. The connection id is unique by SQL
    // plugin contract (one entry per SQL connection). The display `name` is
    // user-controlled and can collide across datasources, so we deliberately
    // do NOT fall back on it here — a collision would silently shadow one
    // datasource's lookups with another's. Callers that have only the
    // display name must resolve it via `list()` and disambiguate themselves.
    let match: Datasource | null = null;
    for (const ds of this.datasources.values()) {
      if (ds.directQueryName !== id) continue;
      if (match) {
        this.logger.warn(
          `datasourceService.get: directQueryName "${id}" matched multiple entries (${match.id}, ${ds.id}); refusing ambiguous resolution`
        );
        return null;
      }
      match = ds;
    }
    return match;
  }

  async create(input: Omit<Datasource, 'id'>): Promise<Datasource> {
    const id = `ds-${++this.counter}`;
    const datasource: Datasource = { id, ...input };
    this.datasources.set(id, datasource);
    this.idByStableKey.set(stableKey(datasource), id);
    this.logger.debug(`Created datasource: ${id} (${input.name})`);
    return datasource;
  }

  async update(id: string, input: Partial<Datasource>): Promise<Datasource | null> {
    const datasource = this.datasources.get(id);
    if (!datasource) return null;

    const oldKey = stableKey(datasource);
    Object.assign(datasource, input);
    const newKey = stableKey(datasource);
    if (oldKey !== newKey) {
      this.idByStableKey.delete(oldKey);
      this.idByStableKey.set(newKey, id);
    }
    this.logger.debug(`Updated datasource: ${id}`);
    return datasource;
  }

  /**
   * Align the registry with a freshly-discovered set from saved objects.
   *
   * Entries are matched by `stableKey` — `directQueryName` for Prometheus,
   * `mdsId` for MDS OpenSearch, `type:url` for the local-cluster sentinel.
   * Matches are updated in place so the numeric `ds-N` id stays stable
   * across refreshes; discovery-owned entries that vanished are pruned.
   *
   * Previously this was handled by `delete-all` + `seed`, which cycled the
   * counter every 30 seconds and silently orphaned every persisted SLO
   * whose datasourceId pointed at the old `ds-N`.
   *
   * User-managed entries (created via `POST /api/alerting/datasources`, no
   * `directQueryName` or `mdsId`) are only touched if their stable key
   * appears in the discovered set — which it won't, because only discovery
   * emits a sentinel local-cluster entry. They survive the reconcile.
   */
  async reconcile(discovered: Array<Omit<Datasource, 'id'>>): Promise<void> {
    const incomingKeys = new Set<string>();
    for (const entry of discovered) {
      const key = stableKey(entry);
      incomingKeys.add(key);
      const existingId = this.idByStableKey.get(key);
      if (existingId) {
        const current = this.datasources.get(existingId);
        if (current) {
          // Preserve id; refresh every other field from the SO so renames /
          // URL changes / enable flips land without re-numbering.
          Object.assign(current, entry);
          continue;
        }
      }
      await this.create(entry);
    }

    // Prune discovery-owned entries that disappeared. Identify them by the
    // same stable-key scheme: discovery only emits entries with mdsId,
    // directQueryName, or the local-cluster sentinel key. Anything else in
    // the map was created by a manual POST and must not be pruned here.
    for (const [key, id] of this.idByStableKey.entries()) {
      if (incomingKeys.has(key)) continue;
      const ds = this.datasources.get(id);
      if (!ds) {
        this.idByStableKey.delete(key);
        continue;
      }
      const isDiscoveryOwned =
        !!ds.mdsId || !!ds.directQueryName || stableKey(ds) === `raw:opensearch:local`;
      if (isDiscoveryOwned) {
        this.datasources.delete(id);
        this.idByStableKey.delete(key);
        this.logger.debug(`Pruned stale discovered datasource: ${id} (${ds.name})`);
      }
    }
  }

  async delete(id: string): Promise<boolean> {
    const ds = this.datasources.get(id);
    const existed = this.datasources.delete(id);
    if (existed && ds) {
      this.idByStableKey.delete(stableKey(ds));
      this.logger.debug(`Deleted datasource: ${id}`);
    }
    return existed;
  }

  async testConnection(
    client: AlertingOSClient,
    id: string
  ): Promise<{ success: boolean; message: string }> {
    const datasource = this.datasources.get(id);
    if (!datasource) {
      return { success: false, message: 'Datasource not found' };
    }

    try {
      if (datasource.type === 'opensearch') {
        // Probe cluster via OSD scoped client — auth/TLS handled by OSD.
        const resp = await client.transport.request<{ status?: string }>({
          method: 'GET',
          path: '/',
        });
        const status = (resp?.body as { status?: string } | undefined)?.status;
        return {
          success: true,
          message: status ? `Connected. Cluster health: ${status}` : 'Connected.',
        };
      } else if (datasource.type === 'prometheus') {
        // Skip active probe. The first real query will surface any
        // connection issue naturally, and Prometheus endpoints are reached via
        // the OSD DirectQuery resource proxy (no direct Prom connectivity to
        // test from here). Keep the UI "Test connection" button working by
        // succeeding with a note.
        return { success: true, message: 'Prometheus (no active probe)' };
      }
      return { success: false, message: `Unknown datasource type: ${datasource.type}` };
    } catch (err) {
      return {
        success: false,
        message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async listWorkspaces(client: AlertingOSClient, dsId: string): Promise<Datasource[]> {
    const ds = this.datasources.get(dsId);
    if (!ds || ds.type !== 'prometheus' || !this.promBackend) return [];

    const workspaces = await this.promBackend.listWorkspaces(client, ds);
    return workspaces.map((ws) => ({
      id: `${dsId}::${ws.id}`,
      name: `${ds.name} / ${ws.alias || ws.name}`,
      type: ds.type,
      url: ds.url,
      enabled: ws.status === 'active',
      workspaceId: ws.id,
      workspaceName: ws.name,
      parentDatasourceId: dsId,
    }));
  }

  // Helper to seed initial datasources. Prefer `reconcile` for discovery
  // flows — `seed` unconditionally bumps the counter and is meant for tests
  // or one-shot bootstrap.
  seed(datasources: Array<Omit<Datasource, 'id'>>): void {
    for (const ds of datasources) {
      this.create(ds);
    }
  }
}
