/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedQuery, SavedVisualization } from '../../../../common/types/explorer';

export interface SavedObjectsCreateResponse {
  objectId: string;
}

export type SavedObjectsUpdateResponse = SavedObjectsCreateResponse;

export interface ObservabilitySavedObject {
  createdTimeMs: number;
  lastUpdatedTimeMs: number;
  objectId: string;
  tenant?: string;
  savedVisualization?: SavedVisualization;
  savedQuery?: SavedQuery;
}

export interface SavedObjectsGetResponse {
  startIndex?: number;
  totalHits?: number;
  totalHitRelation?: 'eq' | 'gte';
  observabilityObjectList: ObservabilitySavedObject[];
}
