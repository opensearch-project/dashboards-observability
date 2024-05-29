/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export function getTenantIndexName(indexName: string, tenantName?: string) {
  if (indexName.charAt(indexName.length - 1) === '*') {
    indexName = indexName.slice(0, -1);
  }

  if (tenantName) {
    if (indexName.charAt(indexName.length - 1) !== '-') indexName += '-';
    indexName += `${tenantName.toLowerCase()}`;
  }

  return indexName + '*';
}
