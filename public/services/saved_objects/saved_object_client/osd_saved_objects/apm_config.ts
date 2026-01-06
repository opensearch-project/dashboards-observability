/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsFindOptions } from '../../../../../../../src/core/public';
import {
  ApmConfigAttributes,
  ResolvedApmConfig,
} from '../../../../../common/types/observability_saved_object_attributes';
import { getOSDSavedObjectsClient } from '../../../../../common/utils';
import { OSDSavedObjectClient } from './osd_saved_object_client';

const CORRELATIONS_SAVED_OBJECT = 'correlations';
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

    // Build new references array
    const references = this.createReferences({
      tracesDatasetId: params.tracesDatasetId || existing.references[0].id,
      serviceMapDatasetId: params.serviceMapDatasetId || existing.references[1].id,
      prometheusDataSourceId: params.prometheusDataSourceId || existing.references[2].id,
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
   */
  async getBulkWithResolvedReferences(
    params: Partial<SavedObjectsFindOptions> = {}
  ): Promise<{ configs: ResolvedApmConfig[]; total: number }> {
    const findParams: SavedObjectsFindOptions = {
      ...params,
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
        const tracesDataset = obj.references.find((ref) => ref.name === 'entities[0].index');
        const serviceMapDataset = obj.references.find((ref) => ref.name === 'entities[1].index');
        const prometheusDS = obj.references.find(
          (ref) => ref.name === 'entities[2].dataConnection'
        );

        // Fetch saved objects to get titles
        const [traces, serviceMap, prometheus] = await Promise.all([
          tracesDataset
            ? this.client.get('index-pattern', tracesDataset.id).catch(() => null)
            : null,
          serviceMapDataset
            ? this.client.get('index-pattern', serviceMapDataset.id).catch(() => null)
            : null,
          prometheusDS
            ? this.client.get('data-connection', prometheusDS.id).catch(() => null)
            : null,
        ]);

        return {
          ...obj.attributes,
          objectId: this.prependTypeToId(obj.id),
          tracesDataset: traces
            ? {
                id: tracesDataset!.id,
                title: traces.attributes?.title || tracesDataset!.id,
              }
            : null,
          serviceMapDataset: serviceMap
            ? {
                id: serviceMapDataset!.id,
                title: serviceMap.attributes?.title || serviceMapDataset!.id,
              }
            : null,
          prometheusDataSource: prometheus
            ? {
                id: prometheusDS!.id,
                title:
                  prometheus.attributes?.title ||
                  prometheus.attributes?.connectionId ||
                  prometheusDS!.id,
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
