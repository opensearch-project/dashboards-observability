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
 * called (they are no longer reachable — the client-facing CRUD routes were
 * removed in Phase 3).
 *
 * Instantiate per-request with the request's `ctx.core.savedObjects.client`.
 */
import type { SavedObject, SavedObjectsClientContract } from '../../../../../src/core/server';
import type {
  AlertingOSClient,
  Datasource,
  DatasourceService,
  Logger,
} from '../../../common/types/alerting';

interface DataSourceSOAttributes {
  title?: string;
  endpoint?: string;
}

interface DataConnectionSOAttributes {
  connectionId?: string;
  type?: string;
}

export class SavedObjectDatasourceService implements DatasourceService {
  constructor(
    private readonly savedObjects: SavedObjectsClientContract,
    private readonly logger?: Logger
  ) {}

  async list(): Promise<Datasource[]> {
    const all: Datasource[] = [];
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
    // Fallback so unified-view routes can still respond on a bare cluster.
    if (all.length === 0) {
      all.push({
        id: 'local-cluster',
        name: 'Local Cluster',
        type: 'opensearch',
        url: 'local',
        enabled: true,
      });
    }
    return all;
  }

  async get(id: string): Promise<Datasource | null> {
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
      'SavedObjectDatasourceService.create is not supported — datasource CRUD removed in Phase 3'
    );
  }

  async update(_id: string, _input: Partial<Datasource>): Promise<Datasource | null> {
    throw new Error(
      'SavedObjectDatasourceService.update is not supported — datasource CRUD removed in Phase 3'
    );
  }

  async delete(_id: string): Promise<boolean> {
    throw new Error(
      'SavedObjectDatasourceService.delete is not supported — datasource CRUD removed in Phase 3'
    );
  }

  async testConnection(
    _client: AlertingOSClient,
    _id: string
  ): Promise<{ success: boolean; message: string }> {
    throw new Error(
      'SavedObjectDatasourceService.testConnection is not supported — datasource CRUD removed in Phase 3'
    );
  }

  async listWorkspaces(_client: AlertingOSClient, _dsId: string): Promise<Datasource[]> {
    throw new Error(
      'SavedObjectDatasourceService.listWorkspaces is not supported — datasource workspace discovery removed in Phase 3'
    );
  }
}
