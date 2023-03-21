/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ISavedObjectsClient {
  create: (params: any) => Promise<any>;
  get: (params: any) => Promise<any>;
  getBulk: (params: any) => Promise<Array<Promise<any>>>;
  update: (params: any) => Promise<any>;
  updateBulk: (params: any) => Promise<Array<Promise<any>>>;
  delete: (params: any) => Promise<any>;
  deleteBulk: (params: any) => Promise<Array<Promise<any>>>;
}
