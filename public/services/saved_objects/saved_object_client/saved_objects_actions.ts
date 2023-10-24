/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SEARCH_SAVED_OBJECT,
  VISUALIZATION_SAVED_OBJECT,
} from '../../../../common/types/observability_saved_object_attributes';
import { ISavedObjectRequestParams } from '../event_analytics/saved_objects';
import { OSDSavedObjectClient } from './osd_saved_objects/osd_saved_object_client';
import { OSDSavedVisualizationClient } from './osd_saved_objects/saved_visualization';
import { OSDSavedSearchClient } from './osd_saved_objects/saved_searches';
import { ObservabilitySavedObjectsType } from './osd_saved_objects/types';
import { PPLSavedQueryClient } from './ppl';
import {
  ObservabilitySavedObject,
  SavedObjectsDeleteBulkParams,
  SavedObjectsDeleteParams,
  SavedObjectsDeleteResponse,
  SavedObjectsGetParams,
  SavedObjectsGetResponse,
} from './types';

/**
 * Helper class that dynamically determines which saved object client to use
 * for get and delete operations. This servers as a compatibility layer before
 * the .opensearch-observability index is deprecated.
 */
export class SavedObjectsActions {
  static get(params: SavedObjectsGetParams): Promise<SavedObjectsGetResponse> {
    const type = OSDSavedObjectClient.extractType(params.objectId);
    switch (type) {
      case VISUALIZATION_SAVED_OBJECT:
        return OSDSavedVisualizationClient.getInstance().get(params);
      case SEARCH_SAVED_OBJECT:
        return OSDSavedSearchClient.getInstance().get(params);

      default:
        // for non-osd objects it does not matter which client implementation
        // is used for get()
        return PPLSavedQueryClient.getInstance().get(params);
    }
  }

  static async getBulk<T extends ObservabilitySavedObject>(
    params: ISavedObjectRequestParams
  ): Promise<SavedObjectsGetResponse<T>> {
    const objects = await PPLSavedQueryClient.getInstance().getBulk(params);
    if (params.objectType?.includes('savedVisualization')) {
      const osdVisualizationObjects = await OSDSavedVisualizationClient.getInstance().getBulk();
      if (objects.totalHits && osdVisualizationObjects.totalHits) {
        objects.totalHits += osdVisualizationObjects.totalHits;
      }
      objects.observabilityObjectList = [
        ...objects.observabilityObjectList,
        ...osdVisualizationObjects.observabilityObjectList,
      ];
    }

    if (params.objectType?.includes('savedQuery')) {
      const osdSearchObjects = await OSDSavedSearchClient.getInstance().getBulk();
      if (objects.totalHits && osdSearchObjects.totalHits) {
        objects.totalHits += osdSearchObjects.totalHits;
      }
      objects.observabilityObjectList = [
        ...objects.observabilityObjectList,
        ...osdSearchObjects.observabilityObjectList,
      ];
    }

    if (params.sortOrder === 'asc') {
      objects.observabilityObjectList.sort((a, b) => a.lastUpdatedTimeMs - b.lastUpdatedTimeMs);
    } else {
      objects.observabilityObjectList.sort((a, b) => b.lastUpdatedTimeMs - a.lastUpdatedTimeMs);
    }
    return objects as SavedObjectsGetResponse<T>;
  }

  static delete(params: SavedObjectsDeleteParams): Promise<SavedObjectsDeleteResponse> {
    const type = OSDSavedObjectClient.extractType(params.objectId);
    switch (type) {
      case VISUALIZATION_SAVED_OBJECT:
        return OSDSavedVisualizationClient.getInstance().delete(params);
      case SEARCH_SAVED_OBJECT:
        return OSDSavedSearchClient.getInstance().delete(params);

      default:
        return PPLSavedQueryClient.getInstance().delete(params);
    }
  }

  /**
   * Delete a list of objects. Assumes object is osd visualization if id is a
   * UUID. Rest and failed ids will then be deleted by PPL client.
   *
   * @param params - SavedObjectsDeleteBulkParams
   * @returns SavedObjectsDeleteResponse
   */
  static async deleteBulk(
    params: SavedObjectsDeleteBulkParams
  ): Promise<SavedObjectsDeleteResponse> {
    const idMap = params.objectIdList.reduce((prev, id) => {
      const type = OSDSavedObjectClient.extractType(id);
      const key = type === '' ? 'non_osd' : type;
      return { ...prev, [key]: [...(prev[key] || []), id] };
    }, {} as { [k in 'non_osd' | ObservabilitySavedObjectsType]: string[] });

    const responses: SavedObjectsDeleteResponse = { deleteResponseList: {} };

    if (idMap[VISUALIZATION_SAVED_OBJECT]?.length) {
      const visualizationDeleteResponses = await OSDSavedVisualizationClient.getInstance().deleteBulk(
        {
          objectIdList: idMap[VISUALIZATION_SAVED_OBJECT],
        }
      );
      responses.deleteResponseList = {
        ...responses.deleteResponseList,
        ...visualizationDeleteResponses.deleteResponseList,
      };
    }

    if (idMap[SEARCH_SAVED_OBJECT]?.length) {
      const searchDeleteResponses = await OSDSavedSearchClient.getInstance().deleteBulk({
        objectIdList: idMap[SEARCH_SAVED_OBJECT],
      });
      responses.deleteResponseList = {
        ...responses.deleteResponseList,
        ...searchDeleteResponses.deleteResponseList,
      };
    }

    const remainingObjectIds = [
      ...new Set(
        idMap.non_osd?.concat(
          Object.entries(responses.deleteResponseList)
            .filter(([_, status]) => status !== 'OK')
            .map(([id, _]) => id)
        )
      ),
    ];
    if (remainingObjectIds.length) {
      const remainingDeleteResponses = await PPLSavedQueryClient.getInstance().deleteBulk({
        objectIdList: remainingObjectIds,
      });
      responses.deleteResponseList = {
        ...responses.deleteResponseList,
        ...remainingDeleteResponses.deleteResponseList,
      };
    }
    return responses;
  }
}
