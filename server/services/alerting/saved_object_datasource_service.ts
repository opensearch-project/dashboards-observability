/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Saved-object-backed `DatasourceService` adapter.
 *
 * The alerting service layer (`MultiBackendAlertService`, `PrometheusMetadataService`)
 * was originally written against the now-deleted `InMemoryDatasourceService`.
 * To keep those services unchanged for this refactor, we implement the
 * `DatasourceService` interface they expect using the OSD saved-objects client,
 * reading `data-source` (OpenSearch) and `data-connection` (Prometheus) types
 * directly.
 *
 * `get()` and `list()` are the only methods the service layer actually uses
 * at runtime; `create`, `update`, `delete`, and `testConnection` throw if
 * called (they are no longer reachable — the client-facing CRUD routes have
 * been removed).
 *
 * Instantiate per-request with the request's `ctx.core.savedObjects.client`.
 */
import type { SavedObject, SavedObjectsClientContract } from '../../../../../src/core/server';
import type {
  AlertingOSClient,
  CloudWatchTargets,
  Datasource,
  DatasourceListOptions,
  DatasourceService,
  Logger,
} from '../../../common/types/alerting';
import {
  CLOUDWATCH_DATASOURCE_ID,
  buildCloudWatchDatasource,
  cloudWatchDatasourcesFor,
  decodeCloudWatchDatasourceId,
  resolveCloudWatchTarget,
} from '../../../common/services/alerting/cloudwatch_datasource_id';
import { describeSourceError } from './cloudwatch/cloudwatch_backend';
import { TimeoutError } from './timeout_error';
import { CloudWatchTargetsUnavailableError } from './cloudwatch_targets_unavailable_error';

export { CloudWatchTargetsUnavailableError };

/** Default upper bound on the CloudWatch targets read. */
const DEFAULT_CLOUDWATCH_TARGETS_TIMEOUT_MS = 10_000;

interface DataSourceSOAttributes {
  title?: string;
  endpoint?: string;
}

interface DataConnectionSOAttributes {
  connectionId?: string;
  type?: string;
}

/**
 * The virtual CloudWatch datasource id. There is no saved object for it — the
 * CloudWatch integration is a zero-setup virtual datasource for the account the
 * caller's AWS credentials reach (through the deployment's source). Defined in
 * `common/services/alerting/cloudwatch_datasource_id.ts` with the ids of the other
 * (scope, region) pairs; re-exported here for server callers.
 */
export { CLOUDWATCH_DATASOURCE_ID };

export interface CloudWatchDatasourceConfig {
  /**
   * Whether the virtual datasource exists. A function is asked lazily, only when the listing or
   * a `get('cloudwatch')` needs it (per request: the flag and the deployment's source).
   */
  enabled: boolean | (() => Promise<boolean>);
  /** The region the source queries; undefined lets the source use its own default. */
  region?: string;
  /**
   * The account scopes and regions the source offers, or undefined when it doesn't report them
   * (then there is one datasource, `cloudwatch`). Asked at most once per service instance.
   * `signal` fires when the read times out.
   */
  targets?: (signal: AbortSignal) => Promise<CloudWatchTargets | undefined>;
  /**
   * Upper bound on the targets read (default 10 s). A read that takes longer is aborted and
   * treated like a failed one: the single `cloudwatch` datasource.
   */
  targetsTimeoutMs?: number;
}

export class SavedObjectDatasourceService implements DatasourceService {
  constructor(
    private readonly savedObjects: SavedObjectsClientContract,
    private readonly logger?: Logger,
    /**
     * When present and `enabled`, the virtual CloudWatch datasource is appended
     * to `list()` and resolvable via `get('cloudwatch')`. Injected from the
     * `observability.cloudwatch` config so the whole integration ships dark.
     */
    private readonly cloudWatch?: CloudWatchDatasourceConfig
  ) {}

  private cloudWatchTargetsPromise?: Promise<CloudWatchTargets | undefined>;
  /** Set when the targets read failed or timed out (not when the source reports none). */
  private cloudWatchTargetsFailure?: { error: unknown };

  /**
   * The source's targets, once per instance. A failure or timeout falls back to the single
   * datasource, so listings and lookups never wait on the source longer than the bound.
   */
  private cloudWatchTargets(): Promise<CloudWatchTargets | undefined> {
    const targets = this.cloudWatch?.targets;
    if (!targets) return Promise.resolve(undefined);
    if (!this.cloudWatchTargetsPromise) {
      const ms = this.cloudWatch?.targetsTimeoutMs ?? DEFAULT_CLOUDWATCH_TARGETS_TIMEOUT_MS;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new TimeoutError(`CloudWatch targets timed out after ${ms}ms`, ms);
          controller.abort(err);
          reject(err);
        }, ms);
      });
      this.cloudWatchTargetsPromise = Promise.race([
        Promise.resolve().then(() => targets(controller.signal)),
        timeout,
      ])
        .finally(() => clearTimeout(timer))
        .catch((e) => {
          this.cloudWatchTargetsFailure = { error: e };
          this.logger?.debug(
            `SavedObjectDatasourceService: CloudWatch targets failed: ${describeSourceError(e)}`
          );
          return undefined;
        });
    }
    return this.cloudWatchTargetsPromise;
  }

  private async isCloudWatchEnabled(): Promise<boolean> {
    const enabled = this.cloudWatch?.enabled;
    if (typeof enabled === 'function') {
      try {
        return await enabled();
      } catch (e) {
        this.logger?.debug(
          `SavedObjectDatasourceService: CloudWatch gate failed: ${(e as Error)?.name}`
        );
        return false;
      }
    }
    return !!enabled;
  }

  private cloudWatchDatasource(): Datasource {
    return {
      id: CLOUDWATCH_DATASOURCE_ID,
      name: 'CloudWatch',
      type: 'cloudwatch',
      url: 'cloudwatch',
      enabled: true,
      region: this.cloudWatch?.region,
    };
  }

  /** The datasource for a CloudWatch id the source offers, else null. */
  private resolveCloudWatchId(targets: CloudWatchTargets, id: string): Datasource | null {
    const resolved = resolveCloudWatchTarget(targets, id);
    return (
      (resolved && buildCloudWatchDatasource(targets, resolved.scope, resolved.region)) || null
    );
  }

  async list(options?: DatasourceListOptions): Promise<Datasource[]> {
    const all: Datasource[] = [];
    let osCount = 0;
    try {
      const osRes = await this.savedObjects.find<DataSourceSOAttributes>({
        type: 'data-source',
        perPage: 100,
      });
      for (const so of osRes.saved_objects || []) {
        all.push({
          id: so.id,
          name: so.attributes.title || so.id,
          type: 'opensearch',
          url: so.attributes.endpoint || '',
          enabled: true,
          mdsId: so.id,
        });
        osCount++;
      }
    } catch (e) {
      this.logger?.debug(`SavedObjectDatasourceService: data-source lookup failed: ${e}`);
    }
    try {
      const dcRes = await this.savedObjects.find<DataConnectionSOAttributes>({
        type: 'data-connection',
        perPage: 100,
      });
      for (const so of dcRes.saved_objects || []) {
        const t = so.attributes?.type;
        if (t === 'Prometheus' || t === 'Amazon Managed Prometheus') {
          all.push({
            id: so.id,
            name: so.attributes.connectionId || so.id,
            type: 'prometheus',
            url: so.id,
            enabled: true,
            directQueryName: so.attributes.connectionId,
          });
        }
      }
    } catch (e) {
      this.logger?.debug(`SavedObjectDatasourceService: data-connection lookup failed: ${e}`);
    }
    // Synthetic local-cluster fallback so unified-view routes can read from
    // the local OS when no MDS `data-source` saved objects exist. Gated on
    // OS count, NOT total `all.length`: a Prometheus-only `data-connection`
    // shouldn't suppress the local OS cluster — without this, registering
    // any DirectQuery connection silently hides every OS monitor / alert
    // from the unified endpoints. Mirrors the client-side gate in
    // `mapSavedObjectsToDatasources`.
    if (osCount === 0) {
      all.push({
        id: 'local-cluster',
        name: 'Local Cluster',
        type: 'opensearch',
        url: 'local',
        enabled: true,
      });
    }
    // Virtual CloudWatch datasource — no saved object; appears automatically
    // when the feature is enabled and a CloudWatch source is available.
    // With targets, one per account scope at the shared default region (the browser's rule
    // when no region is stored), so both sides list the same ids.
    if (options?.includeCloudWatch !== false && (await this.isCloudWatchEnabled())) {
      const targets = await this.cloudWatchTargets();
      if (targets) {
        all.push(
          ...cloudWatchDatasourcesFor(targets, targets.defaultRegion ? [targets.defaultRegion] : [])
        );
      } else {
        all.push(this.cloudWatchDatasource());
      }
    }
    return all;
  }

  async get(id: string): Promise<Datasource | null> {
    // `cloudwatch` is always the virtual datasource.
    if (id === CLOUDWATCH_DATASOURCE_ID) {
      if (!(await this.isCloudWatchEnabled())) return null;
      const targets = await this.cloudWatchTargets();
      return targets ? this.resolveCloudWatchId(targets, id) : this.cloudWatchDatasource();
    }
    // Other CloudWatch ids exist only while the source reports targets. An offered pair resolves
    // without a saved-object lookup. When the targets read failed, the id can't be checked, so it
    // isn't looked up as a saved object either: `CloudWatchTargetsUnavailableError`. Otherwise
    // (not offered, no targets reported, or the id doesn't decode) it may name a saved object,
    // e.g. a data connection called `cloudwatch_…`, so fall through.
    if (decodeCloudWatchDatasourceId(id) && (await this.isCloudWatchEnabled())) {
      const targets = await this.cloudWatchTargets();
      if (targets) {
        const ds = this.resolveCloudWatchId(targets, id);
        if (ds) return ds;
      } else if (this.cloudWatchTargetsFailure) {
        throw new CloudWatchTargetsUnavailableError(this.cloudWatchTargetsFailure.error);
      }
    }
    if (!id || id === 'local-cluster') {
      return {
        id: 'local-cluster',
        name: 'Local Cluster',
        type: 'opensearch',
        url: 'local',
        enabled: true,
      };
    }
    // Try data-source (OpenSearch) first.
    try {
      const so = await this.savedObjects.get<DataSourceSOAttributes>('data-source', id);
      return {
        id: so.id,
        name: so.attributes.title || so.id,
        type: 'opensearch',
        url: so.attributes.endpoint || '',
        enabled: true,
        mdsId: so.id,
      };
    } catch {
      // not OS — fall through to try data-connection
    }
    // Try data-connection (Prometheus) — match by saved-object id OR connectionId.
    try {
      const dcRes = await this.savedObjects.find<DataConnectionSOAttributes>({
        type: 'data-connection',
        perPage: 100,
      });
      const match = (dcRes.saved_objects || []).find(
        (so: SavedObject<DataConnectionSOAttributes>) => {
          const t = so.attributes?.type;
          if (t !== 'Prometheus' && t !== 'Amazon Managed Prometheus') return false;
          return so.id === id || so.attributes?.connectionId === id;
        }
      );
      if (match) {
        return {
          id: match.id,
          name: match.attributes.connectionId || match.id,
          type: 'prometheus',
          url: match.id,
          enabled: true,
          directQueryName: match.attributes.connectionId,
        };
      }
    } catch (e) {
      this.logger?.debug(
        `SavedObjectDatasourceService.get(${id}) data-connection lookup failed: ${e}`
      );
    }
    return null;
  }

  async create(_input: Omit<Datasource, 'id'>): Promise<Datasource> {
    throw new Error(
      'SavedObjectDatasourceService.create is not supported — datasource CRUD has been removed'
    );
  }

  async update(_id: string, _input: Partial<Datasource>): Promise<Datasource | null> {
    throw new Error(
      'SavedObjectDatasourceService.update is not supported — datasource CRUD has been removed'
    );
  }

  async delete(_id: string): Promise<boolean> {
    throw new Error(
      'SavedObjectDatasourceService.delete is not supported — datasource CRUD has been removed'
    );
  }

  async testConnection(
    _client: AlertingOSClient,
    _id: string
  ): Promise<{ success: boolean; message: string }> {
    throw new Error(
      'SavedObjectDatasourceService.testConnection is not supported — datasource CRUD has been removed'
    );
  }

  async listWorkspaces(_client: AlertingOSClient, _dsId: string): Promise<Datasource[]> {
    throw new Error(
      'SavedObjectDatasourceService.listWorkspaces is not supported — datasource workspace discovery has been removed'
    );
  }
}
