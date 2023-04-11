/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedQuery, SavedVisualization } from '../../../../common/types/explorer';
import { SAVED_QUERY, SAVED_VISUALIZATION } from '../../../../common/constants/explorer';

export interface SavedObjectsCreateResponse {
  objectId: string;
}

export type SavedObjectsUpdateResponse = SavedObjectsCreateResponse;

interface ObservabilitySavedObjectBase {
  createdTimeMs: number;
  lastUpdatedTimeMs: number;
  objectId: string;
  tenant?: string;
}

export interface ObservabilitySavedVisualization extends ObservabilitySavedObjectBase {
  [SAVED_VISUALIZATION]: SavedVisualization;
}

export interface ObservabilitySavedQuery extends ObservabilitySavedObjectBase {
  [SAVED_QUERY]: SavedQuery;
}

export type ObservabilitySavedObject = ObservabilitySavedVisualization | ObservabilitySavedQuery;

export interface SavedObjectsGetParams {
  objectId: string;
}

export interface SavedObjectsGetResponse<
  T extends ObservabilitySavedObject = ObservabilitySavedObject
> {
  startIndex?: number;
  totalHits?: number;
  totalHitRelation?: 'eq' | 'gte';
  observabilityObjectList: T[];
}

export interface SavedObjectsDeleteParams {
  objectId: string;
}

export interface SavedObjectsDeleteBulkParams {
  objectIdList: string[];
}

export interface SavedObjectsDeleteResponse {
  deleteResponseList: {
    [objectId: string]: string; // org.opensearch.rest.RestStatus, e.g. 'OK'
  };
}
