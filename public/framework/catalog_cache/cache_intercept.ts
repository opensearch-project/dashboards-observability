/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  HttpInterceptorResponseError,
  IHttpInterceptController,
} from '../../../../../src/core/public';
import { SECURITY_PLUGIN_ACCOUNT_API } from '../../../common/constants/shared';
import { CatalogCacheManager } from './cache_manager';

export function catalogCacheInterceptError(): any {
  return (httpErrorResponse: HttpInterceptorResponseError, _: IHttpInterceptController) => {
    if (
      httpErrorResponse.response?.status === 401 &&
      httpErrorResponse.fetchOptions.path === SECURITY_PLUGIN_ACCOUNT_API
    ) {
      // Clears all user catalog cache details
      CatalogCacheManager.clearDataSourceCache();
      CatalogCacheManager.clearAccelerationsCache();
    }
  };
}
