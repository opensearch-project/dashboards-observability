/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsFindOptions } from '../../../../../../../src/core/server';
import {
  NOTEBOOK_SAVED_OBJECT,
  NotebooksSavedObjectAttributes,
  SAVED_OBJECT_VERSION
} from '../../../../../common/types/observability_saved_object_attributes';
import { getOSDSavedObjectsClient } from '../../../../../common/utils';
import {
  SavedObjectsDeleteBulkParams,
  SavedObjectsDeleteParams,
  SavedObjectsDeleteResponse,
  SavedObjectsGetParams,
  SavedObjectsGetResponse
} from '../types';
import { OSDSavedObjectClient } from './osd_saved_object_client';
import { OSDSavedObjectCreateResponse, OSDSavedObjectUpdateResponse } from './types';

interface CommonParams {
    name: string;
    dateCreated: string;
    dateModified: string;
    backend: string;
    paragraphs: [];
    dateRange: [string, string];
  }
  
  type CreateParams = CommonParams & { applicationId: string };
  type UpdateParams = Partial<CommonParams> & { objectId: string };

  export class OSDSavedNotebookClient extends OSDSavedObjectClient {
    private static instance: OSDSavedNotebookClient;

    protected prependTypeToId(objectId: string) {
        return `${NOTEBOOK_SAVED_OBJECT}:${objectId}`;
      }
      async create(
        params: CreateParams
      ): Promise<OSDSavedObjectCreateResponse<NotebooksSavedObjectAttributes>> {
        console.log(params)
        const body = this.buildRequestBody({
            name: params.name,
            dateCreated: params.dateCreated,
            dateModified: params.dateModified,
            backend: params.backend,
            paragraphs: params.paragraphs,
            dateRange: ['now-1d', 'now'],
        });
    
        const response = await this.client.create<NotebooksSavedObjectAttributes>(
         `${NOTEBOOK_SAVED_OBJECT}`,
          {
            title: params.name,
            description: '',
            version: SAVED_OBJECT_VERSION,
            createdTimeMs: new Date().getTime(),
            savedNotebook: {
              ...body.object,
              dateCreated: params.dateCreated,
              dateModified: params.dateModified,
              path: params.name,
              paragraphs: params.paragraphs,
              backend: params.backend
            },
          }
        );
    
        return {
          objectId: this.prependTypeToId(response.id),
          object: response,
        };
      }
    
    async get(params: SavedObjectsGetParams): Promise<SavedObjectsGetResponse> {
        const response = await this.client.get<NotebooksSavedObjectAttributes>(
          NOTEBOOK_SAVED_OBJECT,
          OSDSavedObjectClient.extractTypeAndUUID(params.objectId).uuid
        );
        return {
          observabilityObjectList: [
            {
              objectId: this.prependTypeToId(response.id),
              createdTimeMs: response.attributes.createdTimeMs,
              lastUpdatedTimeMs: OSDSavedObjectClient.convertToLastUpdatedMs(response.updated_at),
              savedNotebook: response.attributes.savedNotebook,
            },
          ],
        };
      }
      
      async getBulk(params: Partial<SavedObjectsFindOptions> = {}): Promise<SavedObjectsGetResponse> {
        const observabilityObjectList = await this.client
          .find<NotebooksSavedObjectAttributes>({
            ...params,
            type: NOTEBOOK_SAVED_OBJECT,
          })
          .then((findRes) =>
            findRes.savedObjects.map((o) => ({
              objectId: this.prependTypeToId(o.id),
              createdTimeMs: o.attributes.createdTimeMs,
              lastUpdatedTimeMs: OSDSavedObjectClient.convertToLastUpdatedMs(o.updated_at),
              savedNotebook: o.attributes.savedNotebook,
              metricType: o.attributes.metricType,
            }))
          );
        return { totalHits: observabilityObjectList.length, observabilityObjectList };
      }
      async update(
        params: UpdateParams
      ): Promise<OSDSavedObjectUpdateResponse<NotebooksSavedObjectAttributes>> {
        const body = this.buildRequestBody({
            name: params.name,
            dateModified: params.dateModified,
            dateRange: ['now-1d', 'now'],
        });
    
        const response = await this.client.update<Partial<NotebooksSavedObjectAttributes>>(
          NOTEBOOK_SAVED_OBJECT,
          OSDSavedObjectClient.extractTypeAndUUID(params.objectId).uuid,
          {
            title: params.name,
            description: 'params.description',
            version: SAVED_OBJECT_VERSION,
            savedNotebook: {
              ...body.object,
              dateModified: params.dateModified,
              path: params.name,
            },
          }
        );
    
        return {
          objectId: this.prependTypeToId(response.id),
          object: response,
        };
      }
      
    updateBulk(params: unknown): Promise<Promise<unknown>[]> {
        throw new Error('Method not implemented.');
    }

    async delete(params: SavedObjectsDeleteParams): Promise<SavedObjectsDeleteResponse> {
        const uuid = OSDSavedObjectClient.extractTypeAndUUID(params.objectId).uuid;
        return this.client
          .delete(NOTEBOOK_SAVED_OBJECT, uuid)
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