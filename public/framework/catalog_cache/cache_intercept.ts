/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HttpFetchOptionsWithPath, IHttpInterceptController } from '../../../../../src/core/public';
import { CatalogCacheManager } from './cache_manager';

export function catalogRequestIntercept(): any {
  return (
    fetchOptions: Readonly<HttpFetchOptionsWithPath>,
    _controller: IHttpInterceptController
  ) => {
    if (fetchOptions.path.includes('/logout')) {
      // Clears all user catalog cache details
      CatalogCacheManager.clearDataSourceCache();
      CatalogCacheManager.clearAccelerationsCache();
    }
  };
}
