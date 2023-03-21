/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ISavedObjectsClient } from './client_interface';

export abstract class SavedObjectClientBase implements ISavedObjectsClient {
  abstract create(params: any): Promise<any>;
  abstract get(params: any): Promise<any>;
  abstract getBulk(params: any): Promise<Array<Promise<any>>>;
  abstract update(params: any): Promise<any>;
  abstract updateBulk(params: any): Promise<Array<Promise<any>>>;
  abstract delete(params: any): Promise<any>;
  abstract deleteBulk(params: any): Promise<Array<Promise<any>>>;
}
