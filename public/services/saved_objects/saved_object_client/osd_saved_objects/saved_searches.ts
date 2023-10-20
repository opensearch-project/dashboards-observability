/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsFindOptions } from '../../../../../../../src/core/public';
import { IField } from '../../../../../common/types/explorer';
import {
  SAVED_OBJECT_VERSION,
  SearchSavedObjectAttributes,
  SEARCH_SAVED_OBJECT,
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

interface CommonParams {
  query: string;
  fields: IField[];
  dateRange: [string, string];
  type: string;
  name: string;
  timestamp: string;
  applicationId: string;
  userConfigs: any;
  description: string;
  subType: string;
  unitsOfMeasure: string;
  selectedLabels: string;
  dataSources: string; // list of type SelectedDataSources that is stringified
  queryLang: string;
}

type CreateParams = CommonParams & { applicationId: string };
type UpdateParams = Partial<CommonParams> & { objectId: string };

export class OSDSavedSearchClient extends OSDSavedObjectClient {
  private static instance: OSDSavedSearchClient;

  protected prependTypeToId(objectId: string) {
    return `${SEARCH_SAVED_OBJECT}:${objectId}`;
  }

  async create(
    params: CreateParams
  ): Promise<OSDSavedObjectCreateResponse<SearchSavedObjectAttributes>> {
    const body = this.buildRequestBody({
      query: params.query,
      fields: params.fields,
      dateRange: params.dateRange,
      name: params.name,
      timestamp: params.timestamp,
      description: params.description,
      dataSources: params.dataSources,
      queryLang: params.queryLang,
    });

    const response = await this.client.create<SearchSavedObjectAttributes>(SEARCH_SAVED_OBJECT, {
      title: params.name,
      description: params.description,
      version: SAVED_OBJECT_VERSION,
      createdTimeMs: new Date().getTime(),
      savedQuery: {
        ...body.object,
      },
    });

    return {
      objectId: this.prependTypeToId(response.id),
      object: response,
    };
  }

  async update(
    params: UpdateParams
  ): Promise<OSDSavedObjectUpdateResponse<SearchSavedObjectAttributes>> {
    const body = this.buildRequestBody({
      query: params.query,
      fields: params.fields,
      dateRange: params.dateRange,
      name: params.name,
      timestamp: params.timestamp,
      description: params.description,
      dataSources: params.dataSources,
      queryLang: params.queryLang,
    });

    const response = await this.client.update<Partial<SearchSavedObjectAttributes>>(
      SEARCH_SAVED_OBJECT,
      OSDSavedObjectClient.extractTypeAndUUID(params.objectId).uuid,
      {
        title: params.name,
        description: params.description,
        version: SAVED_OBJECT_VERSION,
        savedQuery: body.object,
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
    const response = await this.client.get<SearchSavedObjectAttributes>(
      SEARCH_SAVED_OBJECT,
      OSDSavedObjectClient.extractTypeAndUUID(params.objectId).uuid
    );
    return {
      observabilityObjectList: [
        {
          objectId: this.prependTypeToId(response.id),
          createdTimeMs: response.attributes.createdTimeMs,
          lastUpdatedTimeMs: OSDSavedObjectClient.convertToLastUpdatedMs(response.updated_at),
          savedQuery: response.attributes.savedQuery,
        },
      ],
    };
  }

  async getBulk(params: Partial<SavedObjectsFindOptions> = {}): Promise<SavedObjectsGetResponse> {
    const observabilityObjectList = await this.client
      .find<SearchSavedObjectAttributes>({
        ...params,
        type: SEARCH_SAVED_OBJECT,
      })
      .then((findRes) =>
        findRes.savedObjects.map((o) => ({
          objectId: this.prependTypeToId(o.id),
          createdTimeMs: o.attributes.createdTimeMs,
          lastUpdatedTimeMs: OSDSavedObjectClient.convertToLastUpdatedMs(o.updated_at),
          savedQuery: o.attributes.savedQuery,
        }))
      );
    return { totalHits: observabilityObjectList.length, observabilityObjectList };
  }

  async delete(params: SavedObjectsDeleteParams): Promise<SavedObjectsDeleteResponse> {
    const uuid = OSDSavedObjectClient.extractTypeAndUUID(params.objectId).uuid;
    return this.client
      .delete(SEARCH_SAVED_OBJECT, uuid)
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
