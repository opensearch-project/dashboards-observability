/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HttpFetchOptionsWithPath, IHttpInterceptController } from '../../../../../src/core/public';
import { SECURITY_DASHBOARDS_LOGOUT_URL } from '../../../common/constants/data_sources';
import { CatalogCacheManager } from './cache_manager';

export function catalogRequestIntercept(): any {
  return (
    fetchOptions: Readonly<HttpFetchOptionsWithPath>,
    _controller: IHttpInterceptController
  ) => {
    if (fetchOptions.path.includes(SECURITY_DASHBOARDS_LOGOUT_URL)) {
      // Clears all user catalog cache details
      CatalogCacheManager.clearDataSourceCache();
      CatalogCacheManager.clearAccelerationsCache();
    }
  };
}
