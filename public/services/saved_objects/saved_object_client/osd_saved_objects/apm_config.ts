/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsFindOptions } from '../../../../../../../src/core/public';
import { DataPublicPluginStart } from '../../../../../../../src/plugins/data/public';
import {
  ApmConfigAttributes,
  ApmConfigEntity,
  ResolvedApmConfig,
  CORRELATIONS_SAVED_OBJECT,
} from '../../../../../common/types/observability_saved_object_attributes';
import { getOSDSavedObjectsClient } from '../../../../../common/utils';
import { OSDSavedObjectClient } from './osd_saved_object_client';
const APM_CONFIG_PREFIX = 'APM-Config-';

interface CreateApmConfigParams {
  workspaceId: string;
  tracesDatasetId: string;
  serviceMapDatasetId: string;
  prometheusDataSourceId: string;
}

interface UpdateApmConfigParams extends Partial<Omit<CreateApmConfigParams, 'workspaceId'>> {
  objectId: string;
}

export class OSDSavedApmConfigClient extends OSDSavedObjectClient {
  private static instance: OSDSavedApmConfigClient;

  protected prependTypeToId(objectId: string) {
    return `${CORRELATIONS_SAVED_OBJECT}:${objectId}`;
  }

  /**
   * Creates references array following correlations pattern
   */
  private createReferences(params: Omit<CreateApmConfigParams, 'workspaceId'>) {
    return [
      {
        name: 'entities[0].index',
        type: 'index-pattern',
        id: params.tracesDatasetId,
      },
      {
        name: 'entities[1].index',
        type: 'index-pattern',
        id: params.serviceMapDatasetId,
      },
      {
        name: 'entities[2].dataConnection',
        type: 'data-connection',
        id: params.prometheusDataSourceId,
      },
    ];
  }

  /**
   * Creates entities array with reference placeholders
   */
  private createEntities() {
    return [
      { tracesDataset: { id: 'references[0].id' } },
      { serviceMapDataset: { id: 'references[1].id' } },
      { prometheusDataSource: { id: 'references[2].id' } },
    ];
  }

  /**
   * Parses an entity to extract its type and reference index
   * Entity format: { tracesDataset: { id: 'references[0].id' } }
   * Returns: { entityType: 'tracesDataset', referenceIndex: 0 }
   */
  private parseEntityReference(
    entity: ApmConfigEntity
  ): { entityType: string; referenceIndex: number } | null {
    const keys = Object.keys(entity);
    if (keys.length === 0) return null;

    const entityType = keys[0]; // e.g., 'tracesDataset'
    const entityValue = entity[entityType as keyof ApmConfigEntity];
    if (!entityValue?.id) return null;

    // Parse 'references[0].id' to extract index 0
    const match = entityValue.id.match(/references\[(\d+)\]\.id/);
    if (!match) return null;

    return {
      entityType,
      referenceIndex: parseInt(match[1], 10),
    };
  }

  /**
   * Builds a map of entityType -> reference from entities array and references
   */
  private buildEntityRefsMap(
    entities: ApmConfigEntity[],
    references: Array<{ id: string; type: string; name: string }>
  ): Record<string, { id: string; type: string } | undefined> {
    const entityRefs: Record<string, { id: string; type: string } | undefined> = {};

    for (const entity of entities) {
      const parsed = this.parseEntityReference(entity);
      if (parsed && references[parsed.referenceIndex]) {
        entityRefs[parsed.entityType] = {
          id: references[parsed.referenceIndex].id,
          type: references[parsed.referenceIndex].type,
        };
      }
    }

    return entityRefs;
  }

  async create(params: CreateApmConfigParams) {
    const references = this.createReferences(params);
    const entities = this.createEntities();
    const correlationType = `${APM_CONFIG_PREFIX}${params.workspaceId}`;

    const response = await this.client.create<ApmConfigAttributes>(
      CORRELATIONS_SAVED_OBJECT,
      {
        correlationType,
        version: '1.0.0',
        entities,
      },
      {
        references,
      }
    );

    return {
      objectId: this.prependTypeToId(response.id),
      object: response,
    };
  }

  async update(params: UpdateApmConfigParams) {
    const uuid = OSDSavedObjectClient.extractTypeAndUUID(params.objectId).uuid;

    // Get existing config to preserve values not being updated
    const existing = await this.client.get<ApmConfigAttributes>(CORRELATIONS_SAVED_OBJECT, uuid);

    // Build entity refs map to find existing reference IDs by entity type
    const existingEntityRefs = this.buildEntityRefsMap(
      existing.attributes.entities,
      existing.references
    );

    // Build new references array using entity-based lookup for existing values
    const references = this.createReferences({
      tracesDatasetId: params.tracesDatasetId || existingEntityRefs.tracesDataset?.id || '',
      serviceMapDatasetId:
        params.serviceMapDatasetId || existingEntityRefs.serviceMapDataset?.id || '',
      prometheusDataSourceId:
        params.prometheusDataSourceId || existingEntityRefs.prometheusDataSource?.id || '',
    });

    const entities = this.createEntities();

    const response = await this.client.update<ApmConfigAttributes>(
      CORRELATIONS_SAVED_OBJECT,
      uuid,
      {
        correlationType: existing.attributes.correlationType,
        version: existing.attributes.version,
        entities,
      },
      {
        references,
      }
    );

    return {
      objectId: this.prependTypeToId(response.id),
      object: response,
    };
  }

  /**
   * Resolves references to get actual dataset/datasource info
   * Filters for APM configs by correlationType prefix 'APM-Config-'
   * @param dataService - Required data service for fetching DataView details (name, datasourceId)
   */
  async getBulkWithResolvedReferences(
    dataService: DataPublicPluginStart
  ): Promise<{ configs: ResolvedApmConfig[]; total: number }> {
    const findParams: SavedObjectsFindOptions = {
      type: CORRELATIONS_SAVED_OBJECT,
      perPage: 1000, // Fetch all correlations, then filter client-side
    };

    const response = await this.client.find<ApmConfigAttributes>(findParams);

    // Filter for APM configs only (correlationType starts with 'APM-Config-')
    const apmConfigs = response.savedObjects.filter((obj) =>
      obj.attributes.correlationType?.startsWith(APM_CONFIG_PREFIX)
    );

    // Resolve all references to get titles
    const configs = await Promise.all(
      apmConfigs.map(async (obj) => {
        // Build entity refs map to find references by entity type (not by index)
        const entityRefs = this.buildEntityRefsMap(obj.attributes.entities, obj.references);

        const tracesRef = entityRefs.tracesDataset;
        const serviceMapRef = entityRefs.serviceMapDataset;
        const prometheusRef = entityRefs.prometheusDataSource;

        // Fetch DataViews to get title, displayName, and dataSourceRef
        const [tracesDataView, serviceMapDataView, prometheus] = await Promise.all([
          tracesRef ? dataService.dataViews.get(tracesRef.id).catch(() => null) : null,
          serviceMapRef ? dataService.dataViews.get(serviceMapRef.id).catch(() => null) : null,
          prometheusRef
            ? this.client.get('data-connection', prometheusRef.id).catch(() => null)
            : null,
        ]);

        return {
          ...obj.attributes,
          objectId: this.prependTypeToId(obj.id),
          tracesDataset: tracesRef
            ? {
                id: tracesRef.id,
                title: tracesDataView?.title || tracesRef.id,
                name: tracesDataView?.getDisplayName?.(),
                datasourceId: tracesDataView?.dataSourceRef?.id,
              }
            : null,
          serviceMapDataset: serviceMapRef
            ? {
                id: serviceMapRef.id,
                title: serviceMapDataView?.title || serviceMapRef.id,
                name: serviceMapDataView?.getDisplayName?.(),
                datasourceId: serviceMapDataView?.dataSourceRef?.id,
              }
            : null,
          prometheusDataSource: prometheus
            ? {
                id: prometheusRef!.id,
                title:
                  prometheus.attributes?.title ||
                  prometheus.attributes?.connectionId ||
                  prometheusRef!.id,
              }
            : null,
        };
      })
    );

    return { configs, total: apmConfigs.length };
  }

  async delete(params: { objectId: string }) {
    const uuid = OSDSavedObjectClient.extractTypeAndUUID(params.objectId).uuid;
    return this.client.delete(CORRELATIONS_SAVED_OBJECT, uuid);
  }

  static getInstance() {
    if (!this.instance) {
      this.instance = new this(getOSDSavedObjectsClient());
    }
    return this.instance;
  }
}
