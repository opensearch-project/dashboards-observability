/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreRefs } from '../../../framework/core_refs';

/** How long a dataset's field list is reused before it is fetched again. */
export const FIELD_MAPPING_CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  fields: Promise<ReadonlySet<string>>;
}

const cache = new Map<string, CacheEntry>();

/**
 * Names of the fields mapped in the indices matching `pattern` (leaf fields, as dotted paths,
 * e.g. `attributes.server.address`), from the index-patterns field-caps API. Lets a query
 * reference only fields that exist: PPL rejects some unmapped paths outright and runs others
 * as a script over every document.
 *
 * Cached per data source and pattern for FIELD_MAPPING_CACHE_TTL_MS; a failed lookup is not
 * cached.
 *
 * @param pattern - Index name or pattern, e.g. `otel-v1-apm-span-*`
 * @param dataSourceId - MDS data source id; omit for the local cluster
 * @rejects when the lookup fails or the data plugin is unavailable
 */
export function getMappedFieldNames(
  pattern: string,
  dataSourceId?: string
): Promise<ReadonlySet<string>> {
  const key = `${dataSourceId || ''}|${pattern}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < FIELD_MAPPING_CACHE_TTL_MS) return cached.fields;

  const indexPatterns = coreRefs.data?.indexPatterns;
  if (!indexPatterns) {
    return Promise.reject(new Error('Index patterns service is unavailable'));
  }
  const fields = indexPatterns
    .getFieldsForWildcard({ pattern, dataSourceId })
    .then((list: Array<{ name: string }>) => new Set(list.map((f) => f.name)));
  cache.set(key, { fetchedAt: now, fields });
  fields.catch(() => {
    if (cache.get(key)?.fields === fields) cache.delete(key);
  });
  return fields;
}

/** Clears the cache; for tests. */
export function clearFieldMappingCache(): void {
  cache.clear();
}
