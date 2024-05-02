/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from '../../../../../../../src/core/public';

export async function loadTenantInfo(http: CoreStart['http'], multitenancyEnabled: boolean) {
  if (!multitenancyEnabled) {
    return;
  }

  return await http
    .get('/api/v1/multitenancy/tenant')
    .then((tenant) => {
      if (tenant === '' || tenant === '__user__') {
        tenant = '';
      }
      return tenant;
    })
    .catch((error) => {
      if (error.body.statusCode === 404) {
        // endpoint doesn't exist, security plugin is not enabled.
        return undefined;
      }
      console.error(`failed to request tenant: ${String(error)}`);
    });
}
