/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageTypes, PersistedComponent, SemVer, TracesFilter, TracingSchema } from 'common/types/trace_analytics';
import { SavedObjectsFindOptions } from '../../../../../../../src/core/public';
import {
  SAVED_OBJECT_VERSION,
  TRACE_VIEW_SAVED_OBJECT,
  TraceViewSavedObjectAttributes,
} from '../../../../../common/types/observability_saved_object_attributes';
import { getOSDSavedObjectsClient } from '../../../../../common/utils';
import {
  SavedObjectsDeleteBulkParams,
  SavedObjectsDeleteParams,
  SavedObjectsDeleteResponse,
  SavedObjectsGetParams,
  SavedObjectsGetResponse,
} from '../types';
import { OSDSavedObjectClient } from './osd_saved_object_client';
import { OSDSavedObjectCreateResponse, OSDSavedObjectUpdateResponse } from './types';
import { DateMath } from '@opensearch-project/opensearch/api/types';

interface CommonParams {
  name: string;
  description: string;
  schemaVersion: TracingSchema;
  schemaType: SemVer;
  startTime: DateMath;
  endTime: DateMath;
  filters: TracesFilter[];
  searchBarFilters: {
    language: LanguageTypes;
    query: string;
  };
  spanIndices: string;
  serviceIndices: string;
  persistedViews: Record<string, PersistedComponent>;
}

type CreateParams = CommonParams;
type UpdateParams = CommonParams & { objectId: string };

export class OSDSavedTraceViewClient extends OSDSavedObjectClient {
  private static instance: OSDSavedTraceViewClient;

  protected prependTypeToId(objectId: string) {
    return `${TRACE_VIEW_SAVED_OBJECT}:${objectId}`;
  }

  async create(
    params: CreateParams
  ): Promise<OSDSavedObjectCreateResponse<TraceViewSavedObjectAttributes>> {
    const body = {
      name: params.name,
      description: params.description,
      schemaVersion: params.schemaVersion,
      schemaType: params.schemaType,
      startTime: params.startTime,
      endTime: params.endTime,
      filters: params.filters,
      searchBarFilters: params.searchBarFilters,
      spanIndices: params.spanIndices,
      serviceIndices: params.serviceIndices,
      persistedViews: params.persistedViews,
    };

    const response = await this.client.create<TraceViewSavedObjectAttributes>(
      TRACE_VIEW_SAVED_OBJECT,
      {
        title: params.name,
        description: params.description,
        version: SAVED_OBJECT_VERSION,
        createdTimeMs: new Date().getTime(),
        savedTraceView: {
          ...body,
        },
      }
    );

    return {
      objectId: this.prependTypeToId(response.id),
      object: response,
    };
  }

  async update(
    params: UpdateParams
  ): Promise<OSDSavedObjectUpdateResponse<TraceViewSavedObjectAttributes>> {
    const body = {
      name: params.name,
      description: params.description,
      schemaVersion: params.schemaVersion,
      schemaType: params.schemaType,
      startTime: params.startTime,
      endTime: params.endTime,
      filters: params.filters,
      searchBarFilters: params.searchBarFilters,
      spanIndices: params.spanIndices,
      serviceIndices: params.serviceIndices,
      persistedViews: params.persistedViews,
    };

    const response = await this.client.update<Partial<TraceViewSavedObjectAttributes>>(
      TRACE_VIEW_SAVED_OBJECT,
      OSDSavedObjectClient.extractTypeAndUUID(params.objectId).uuid,
      {
        title: params.name,
        description: params.description,
        version: SAVED_OBJECT_VERSION,
        savedTraceView: {
          ...body,
        },
      }
    );

    return {
      objectId: this.prependTypeToId(response.id),
      object: response,
    };
  }

  updateBulk(params: unknown): Promise<Array<Promise<unknown>>> {
    throw new Error('Method not implemented.');
  }

  async get(params: SavedObjectsGetParams): Promise<SavedObjectsGetResponse> {
    const response = await this.client.get<TraceViewSavedObjectAttributes>(
      TRACE_VIEW_SAVED_OBJECT,
      OSDSavedTraceViewClient.extractTypeAndUUID(params.objectId).uuid
    );
    return {
      observabilityObjectList: [
        {
          objectId: this.prependTypeToId(response.id),
          createdTimeMs: response.attributes.createdTimeMs,
          lastUpdatedTimeMs: OSDSavedTraceViewClient.convertToLastUpdatedMs(response.updated_at),
          savedTraceView: response.attributes.savedTraceView,
        },
      ],
    };
  }

  async getBulk(params: Partial<SavedObjectsFindOptions> = {}): Promise<SavedObjectsGetResponse> {
    const observabilityObjectList = await this.client
      .find<TraceViewSavedObjectAttributes>({
        ...params,
        type: TRACE_VIEW_SAVED_OBJECT,
      })
      .then((findRes) =>
        findRes.savedObjects.map((o) => ({
          objectId: this.prependTypeToId(o.id),
          createdTimeMs: o.attributes.createdTimeMs,
          lastUpdatedTimeMs: OSDSavedTraceViewClient.convertToLastUpdatedMs(o.updated_at),
          savedTraceView: o.attributes.savedTraceView,
        }))
      );
    return { totalHits: observabilityObjectList.length, observabilityObjectList };
  }

  async delete(params: SavedObjectsDeleteParams): Promise<SavedObjectsDeleteResponse> {
    const uuid = OSDSavedObjectClient.extractTypeAndUUID(params.objectId).uuid;
    return this.client
      .delete(TRACE_VIEW_SAVED_OBJECT, uuid)
      .then(() => ({ deleteResponseList: { [params.objectId]: 'OK' } }))
      .catch((res) => ({ deleteResponseList: { [params.objectId]: res } }));
  }

  async deleteBulk(params: SavedObjectsDeleteBulkParams): Promise<SavedObjectsDeleteResponse> {
    const deleteResponseList: SavedObjectsDeleteResponse['deleteResponseList'] = {};
    await Promise.allSettled(params.objectIdList.map((objectId) => this.delete({ objectId }))).then(
      (res) => {
        res.forEach((r, i) => {
          deleteResponseList[params.objectIdList[i]] =
            r.status === 'fulfilled'
              ? r.value.deleteResponseList[params.objectIdList[i]]
              : r.reason;
        });
      }
    );
    return { deleteResponseList };
  }

  static getInstance() {
    if (!this.instance) {
      this.instance = new this(getOSDSavedObjectsClient());
    }
    return this.instance;
  }
}