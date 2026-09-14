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
  windowDuration?: number;
  // Optional, experimental: saved dashboard ids to link out from a service.
  correlatedDashboardIds?: string[];
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
    const references = [
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
    // Append correlated dashboards (optional, experimental) at references[3..].
    (params.correlatedDashboardIds ?? []).forEach((id, i) => {
      references.push({ name: `entities.correlatedDashboards[${i}]`, type: 'dashboard', id });
    });
    return references;
  }

  /**
   * Creates entities array with reference placeholders
   */
  private createEntities(
    windowDuration: number | undefined,
    correlatedDashboardIds: string[],
    references: Array<{ name: string; type: string; id: string }>
  ) {
    const entities: ApmConfigEntity[] = [
      { tracesDataset: { id: 'references[0].id' } },
      { serviceMapDataset: { id: 'references[1].id' } },
      { prometheusDataSource: { id: 'references[2].id' } },
      { windowDuration: windowDuration ?? 60 },
    ];
    if (correlatedDashboardIds.length > 0) {
      // Derive the dashboard slots from the actual references array that
      // createReferences produced (dashboards are appended after the fixed
      // dataset/datasource refs), so the entity placeholders stay in lock-step
      // with the reference positions — no hard-coded offset to drift.
      const dashboardRefStart = references.length - correlatedDashboardIds.length;
      entities.push({
        correlatedDashboards: correlatedDashboardIds.map((_, i) => ({
          id: `references[${dashboardRefStart + i}].id`,
        })),
      });
    }
    return entities;
  }

  /**
   * Parses a reference-placeholder string ('references[N].id') to its index N,
   * or null if it is not a valid placeholder. Single source of truth for the
   * placeholder contract, shared by the 1:1 entity resolution
   * (parseEntityReference) and the correlatedDashboards list resolution — the
   * latter being an ARRAY of placeholders (a service can link many dashboards),
   * which is why it is resolved separately rather than through the 1:1 path.
   */
  private static parseReferenceIndex(placeholder: string | undefined): number | null {
    const match = placeholder?.match(/^references\[(\d+)\]\.id$/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Parses a single-value entity to extract its type and reference index
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

    const referenceIndex = OSDSavedApmConfigClient.parseReferenceIndex(entityValue.id);
    if (referenceIndex === null) return null;

    return { entityType, referenceIndex };
  }

  /**
   * Build metadata object for Prometheus data source from saved object attributes.
   * Extracts relevant fields into a metadata object for query requests.
   */
  private buildPrometheusMetadata(
    attributes: Record<string, unknown> | undefined
  ): Record<string, unknown> | undefined {
    if (!attributes) return undefined;

    const meta: Record<string, unknown> = {};

    // Include arn if present
    if (attributes.arn) {
      meta.arn = attributes.arn;
    }

    // Merge any existing meta fields (may be object or stringified JSON)
    if (attributes.meta) {
      let metaObj: Record<string, unknown> | null = null;

      if (typeof attributes.meta === 'string') {
        try {
          metaObj = JSON.parse(attributes.meta);
        } catch (e) {
          console.error('[APM Config] Failed to parse data-connection meta:', e);
        }
      } else if (typeof attributes.meta === 'object') {
        metaObj = attributes.meta as Record<string, unknown>;
      }

      if (metaObj) {
        Object.assign(meta, metaObj);
      }
    }

    return Object.keys(meta).length > 0 ? meta : undefined;
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
    const entities = this.createEntities(
      params.windowDuration,
      params.correlatedDashboardIds ?? [],
      references
    );
    const correlationType = `${APM_CONFIG_PREFIX}${params.workspaceId}`;
    const title = 'apm-config';

    const response = await this.client.create<ApmConfigAttributes>(
      CORRELATIONS_SAVED_OBJECT,
      {
        title,
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
    const tracesId = params.tracesDatasetId || existingEntityRefs.tracesDataset?.id;
    const serviceMapId = params.serviceMapDatasetId || existingEntityRefs.serviceMapDataset?.id;
    const prometheusId =
      params.prometheusDataSourceId || existingEntityRefs.prometheusDataSource?.id;

    // Validate all required reference IDs are present
    if (!tracesId || !serviceMapId || !prometheusId) {
      throw new Error('Cannot update config: missing required reference IDs');
    }

    // Preserve existing correlated dashboards unless the caller passes a new
    // list (an explicit [] clears them). Existing ids come from the SO
    // references of type 'dashboard', which keeps their order.
    const existingDashboardIds = existing.references
      .filter((r) => r.type === 'dashboard')
      .map((r) => r.id);
    const correlatedDashboardIds = params.correlatedDashboardIds ?? existingDashboardIds;

    const references = this.createReferences({
      tracesDatasetId: tracesId,
      serviceMapDatasetId: serviceMapId,
      prometheusDataSourceId: prometheusId,
      correlatedDashboardIds,
    });

    // Preserve existing windowDuration if not provided in update
    const existingWindowDuration =
      existing.attributes.entities.find((e: ApmConfigEntity) => 'windowDuration' in e)
        ?.windowDuration ?? 60;
    const windowDuration = params.windowDuration ?? existingWindowDuration;

    const entities = this.createEntities(windowDuration, correlatedDashboardIds, references);

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

        // Extract windowDuration from entities (plain value, not a reference)
        const windowDurationEntity = obj.attributes.entities.find(
          (e: ApmConfigEntity) => 'windowDuration' in e
        );
        const windowDuration = windowDurationEntity?.windowDuration ?? 60;

        // Resolve correlated dashboards (optional, experimental). Map each
        // placeholder ('references[N].id') to its reference id, then best-effort
        // fetch the title. No dashboards -> no extra fetches (feature inert).
        const dashboardEntity = obj.attributes.entities.find(
          (e: ApmConfigEntity) => 'correlatedDashboards' in e
        );
        const dashboardRefIds = (dashboardEntity?.correlatedDashboards ?? [])
          .map((d) => {
            // Same placeholder contract as the 1:1 entities, via the shared parser.
            const refIndex = OSDSavedApmConfigClient.parseReferenceIndex(d.id);
            return refIndex === null ? undefined : obj.references[refIndex]?.id;
          })
          .filter((id): id is string => Boolean(id));
        const correlatedDashboards = dashboardRefIds.length
          ? await Promise.all(
              dashboardRefIds.map(async (id) => {
                const dash = await this.client.get('dashboard', id).catch(() => null);
                const attrs = dash?.attributes as
                  { title?: string; description?: string } | undefined;
                // A deleted / inaccessible dashboard doesn't necessarily reject:
                // savedObjectsClient.get can resolve a stub carrying an `error`
                // (e.g. 404) with empty attributes. Treat any of those — no
                // object, an error stub, or a missing title — as unavailable so
                // it renders greyed instead of a broken link.
                const missing = !dash || Boolean(dash.error) || !attrs?.title;
                return {
                  dashboardId: id,
                  title: attrs?.title || id,
                  description: missing ? undefined : attrs?.description || undefined,
                  updatedAt: missing ? undefined : dash?.updated_at,
                  missing,
                };
              })
            )
          : [];

        return {
          ...obj.attributes,
          objectId: this.prependTypeToId(obj.id),
          windowDuration,
          correlatedDashboards,
          tracesDataset: tracesRef
            ? {
                id: tracesRef.id,
                title: tracesDataView?.title || tracesRef.id,
                name: tracesDataView?.getDisplayName?.(),
                datasourceId: tracesDataView?.dataSourceRef?.id,
                datasourceTitle: tracesDataView?.dataSourceRef?.name,
              }
            : null,
          serviceMapDataset: serviceMapRef
            ? {
                id: serviceMapRef.id,
                title: serviceMapDataView?.title || serviceMapRef.id,
                name: serviceMapDataView?.getDisplayName?.(),
                datasourceId: serviceMapDataView?.dataSourceRef?.id,
                datasourceTitle: serviceMapDataView?.dataSourceRef?.name,
              }
            : null,
          prometheusDataSource: prometheus
            ? {
                id: prometheusRef!.id, // Saved object ID (for fetching from store)
                name: prometheus.attributes?.connectionId || prometheusRef!.id, // ConnectionId (for PromQL and display)
                meta: this.buildPrometheusMetadata(
                  prometheus.attributes as Record<string, unknown> | undefined
                ),
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
