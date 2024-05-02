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
    .get(`../api/v1/multitenancy/tenant`, {
      headers: {
        'Content-Type': 'application/json',
        'osd-xsrf': 'true',
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,zh-TW;q=0.6',
        pragma: 'no-cache',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
      mode: 'cors',
      credentials: 'include',
    })
    .then((response) => {
      if (response.status === 404) {
        // endpoint doesn't exist, security plugin is not enabled.
        return undefined;
      } else {
        return response.text();
      }
    })
    .then((tenant) => {
      if (tenant === '' || tenant === '__user__') {
        tenant = '';
      }
      return tenant;
    });
}
