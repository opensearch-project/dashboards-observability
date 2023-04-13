/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsCreateResponse, SavedObjectsGetResponse } from './types';

export interface ISavedObjectsClient {
  create: (params: any) => Promise<SavedObjectsCreateResponse>;
  get: (params: any) => Promise<SavedObjectsGetResponse>;
  getBulk: (params: any) => Promise<SavedObjectsGetResponse>;
  update: (params: any) => Promise<any>;
  updateBulk: (params: any) => Promise<unknown>;
  delete: (params: any) => Promise<any>;
  deleteBulk: (params: any) => Promise<unknown>;
}
