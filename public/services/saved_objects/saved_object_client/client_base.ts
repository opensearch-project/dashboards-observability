/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ISavedObjectsClient } from './client_interface';
import { SavedObjectsCreateResponse, SavedObjectsGetResponse } from './types';

export abstract class SavedObjectClientBase implements ISavedObjectsClient {
  abstract create(params: unknown): Promise<SavedObjectsCreateResponse>;
  abstract get(params: unknown): Promise<SavedObjectsGetResponse>;
  abstract getBulk(params: unknown): Promise<SavedObjectsGetResponse>;
  abstract update(params: unknown): Promise<unknown>;
  abstract updateBulk(params: unknown): Promise<Array<Promise<unknown>>>;
  abstract delete(params: unknown): Promise<unknown>;
  abstract deleteBulk(params: unknown): Promise<unknown>;
}
