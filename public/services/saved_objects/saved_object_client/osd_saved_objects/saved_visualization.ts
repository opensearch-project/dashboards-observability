/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsFindOptions } from '../../../../../../../src/core/public';
import { IField } from '../../../../../common/types/explorer';
import {
  SAVED_OBJECT_VERSION,
  VisualizationSavedObjectAttributes,
  VISUALIZATION_SAVED_OBJECT,
} from '../../../../../common/types/observability_saved_object_attributes';
import { SavedObjectsDeleteResponse, SavedObjectsGetResponse } from '../types';
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
}

type CreateParams = CommonParams & { applicationId: string };
type UpdateParams = Partial<CommonParams> & { objectId: string };

interface GetParams {
  objectId: string;
}

export class OSDSavedVisualizationClient extends OSDSavedObjectClient {
  async create(
    params: CreateParams
  ): Promise<OSDSavedObjectCreateResponse<VisualizationSavedObjectAttributes>> {
    const body = this.buildRequestBody({
      query: params.query,
      fields: params.fields,
      dateRange: params.dateRange,
      chartType: params.type,
      name: params.name,
      timestamp: params.timestamp,
      applicationId: params.applicationId,
      userConfigs: params.userConfigs,
      description: params.description,
      subType: params.subType,
      unitsOfMeasure: params.unitsOfMeasure,
      selectedLabels: params.selectedLabels,
    });

    const response = await this.client.create<VisualizationSavedObjectAttributes>(
      VISUALIZATION_SAVED_OBJECT,
      {
        title: params.name,
        description: params.description,
        version: SAVED_OBJECT_VERSION,
        createdTimeMs: new Date().getTime(),
        savedVisualization: {
          ...body.object,
        },
      }
    );

    return {
      objectId: response.id,
      object: response,
    };
  }

  async update(
    params: UpdateParams
  ): Promise<OSDSavedObjectUpdateResponse<VisualizationSavedObjectAttributes>> {
    const body = this.buildRequestBody({
      query: params.query,
      fields: params.fields,
      dateRange: params.dateRange,
      chartType: params.type,
      name: params.name,
      timestamp: params.timestamp,
      applicationId: params.applicationId,
      userConfigs: params.userConfigs,
      description: params.description,
      subType: params.subType,
      unitsOfMeasure: params.unitsOfMeasure,
      selectedLabels: params.selectedLabels,
    });

    const response = await this.client.update<Partial<VisualizationSavedObjectAttributes>>(
      VISUALIZATION_SAVED_OBJECT,
      params.objectId,
      {
        title: params.name,
        description: params.description,
        version: SAVED_OBJECT_VERSION,
        savedVisualization: body.object,
      }
    );

    return {
      objectId: response.id,
      object: response,
    };
  }

  async get(params: GetParams): Promise<SavedObjectsGetResponse> {
    const response = await this.client.get<VisualizationSavedObjectAttributes>(
      VISUALIZATION_SAVED_OBJECT,
      params.objectId
    );
    return {
      observabilityObjectList: [
        {
          objectId: response.id,
          createdTimeMs: response.attributes.createdTimeMs,
          lastUpdatedTimeMs: this.convertToLastUpdatedMs(response.updated_at),
          savedVisualization: response.attributes.savedVisualization,
        },
      ],
    };
  }

  async getBulk(params: Partial<SavedObjectsFindOptions>): Promise<SavedObjectsGetResponse> {
    const observabilityObjectList = await this.client
      .find<VisualizationSavedObjectAttributes>({
        ...params,
        type: VISUALIZATION_SAVED_OBJECT,
      })
      .then((findRes) =>
        findRes.savedObjects.map((o) => ({
          objectId: o.id,
          createdTimeMs: o.attributes.createdTimeMs,
          lastUpdatedTimeMs: this.convertToLastUpdatedMs(o.updated_at),
          savedVisualization: o.attributes.savedVisualization,
        }))
      );
    return { observabilityObjectList };
  }

  async delete(params: { objectId: string }): Promise<SavedObjectsDeleteResponse> {
    return this.client
      .delete(VISUALIZATION_SAVED_OBJECT, params.objectId)
      .then((res) => ({ deleteResponseList: { [params.objectId]: 'OK' } }))
      .catch((res) => ({ deleteResponseList: { [params.objectId]: res } }));
  }

  async deleteBulk(params: { objectIdList: string[] }): Promise<SavedObjectsDeleteResponse> {
    const deleteResponseList: SavedObjectsDeleteResponse['deleteResponseList'] = {};
    const x = await Promise.allSettled(
      params.objectIdList.map((objectId) => this.delete({ objectId }))
    ).then((res) => {
      res.map((r, i) => {
        deleteResponseList[params.objectIdList[i]] = r.status === 'fulfilled' ? r.value : r.reason;
      });
    });
    return { deleteResponseList };
  }
}
