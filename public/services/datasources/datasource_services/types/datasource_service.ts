/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface IDatasourceService {
  getInstance: (dsRef: any) => any;
  getList: (filters: any) => any;
}
