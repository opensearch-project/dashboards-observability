/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import semver from 'semver';
import { SavedObject } from '../../../../src/core/public';
import { DataSourceAttributes } from '../../../../src/plugins/data_source/common/data_sources';
import * as pluginManifest from '../../opensearch_dashboards.json';
import { coreRefs } from '../../public/framework/core_refs';

/**
 * TODO making this method type-safe is nontrivial: if you just define
 * `Nested<T> = { [k: string]: Nested<T> | T }` then you can't accumulate because `T` is not `Nested<T>`
 * There might be a way to define a recursive type that accumulates cleanly but it's probably not
 * worth the effort.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function get<T = unknown>(obj: Record<string, any>, path: string, defaultValue?: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return path.split('.').reduce((acc: any, part: string) => acc && acc[part], obj) || defaultValue;
}

export function addBackticksIfNeeded(input: string): string {
  if (input === undefined) {
    return '';
  }
  // Check if the string already has backticks
  if (input.startsWith('`') && input.endsWith('`')) {
    return input; // Return the string as it is
  } else {
    // Add backticks to the string
    return '`' + input + '`';
  }
}

export function combineSchemaAndDatarows(
  schema: Array<{ name: string; type: string }>,
  datarows: Array<Array<string | number | boolean>>
): object[] {
  const combinedData: object[] = [];

  datarows.forEach((row) => {
    const rowData: { [key: string]: string | number | boolean } = {};
    schema.forEach((field, index) => {
      rowData[field.name] = row[index];
    });
    combinedData.push(rowData);
  });

  return combinedData;
}

/**
 * Safely prepend the `basePath` from `coreRefs` to the given link.
 * If `coreRefs.http.basePath` exists (always true in normal operation), prepend it to the link.
 * If it doesn't exist (usually during unit testing), return the link as-is.
 *
 * @param link The link to prepend with `coreRefs.http.basePath`.
 * @returns The link with the prepended `basePath` if it exists, otherwise the unmodified link.
 */
export const basePathLink = (link: string): string => {
  if (coreRefs.http?.basePath) {
    return coreRefs.http.basePath.prepend(link);
  } else {
    return link;
  }
};

export const dataSourceFilterFn = (dataSource: SavedObject<DataSourceAttributes>) => {
  const dataSourceVersion = dataSource?.attributes?.dataSourceVersion || '';
  const installedPlugins = dataSource?.attributes?.installedPlugins || [];
  return (
    semver.satisfies(dataSourceVersion, pluginManifest.supportedOSDataSourceVersions) &&
    pluginManifest.requiredOSDataSourcePlugins.every((plugin) => installedPlugins.includes(plugin))
  );
};

// Engine types this plugin declines via its manifest's `unsupportedOSDataSourceEngineTypes`.
// Driven by the manifest declaration so changes flow from one source of truth.
const UNSUPPORTED_ENGINE_TYPES: readonly string[] =
  (pluginManifest as { unsupportedOSDataSourceEngineTypes?: readonly string[] })
    .unsupportedOSDataSourceEngineTypes ?? [];

// Slim filter: rejects only data sources whose engine type is in
// `unsupportedOSDataSourceEngineTypes`. Use this where the existing picker had no
// filter at all (e.g. trace analytics) — adding the chained version/plugin gates
// would silently exclude data sources that used to work, including AOSS domains
// (`OpenSearchServerless`) whose installed-plugin set differs from a managed OS
// cluster's. Sub-apps that already enforce those gates pre-PR (metrics, integrations)
// use `dataSourceFilterFnExcludeAnalyticEngine` instead.
export const dataSourceFilterFnByEngineType = (dataSource: SavedObject<DataSourceAttributes>) => {
  const engineType = dataSource?.attributes?.dataSourceEngineType;
  return !(engineType && UNSUPPORTED_ENGINE_TYPES.includes(engineType));
};

// Same checks as dataSourceFilterFn (version + required plugins) plus the engine-type
// exclusion. Use for sub-apps that already enforced version/plugin gates pre-PR.
export const dataSourceFilterFnExcludeAnalyticEngine = (
  dataSource: SavedObject<DataSourceAttributes>
) => dataSourceFilterFnByEngineType(dataSource) && dataSourceFilterFn(dataSource);

// Given a set of data-source saved-object ids, returns the subset whose
// `dataSourceEngineType` is in `unsupportedOSDataSourceEngineTypes` (AnalyticEngine /
// Mustang). Callers that list datasets (index patterns) bound to a data source — e.g. the
// APM settings modal's traces / service-map selectors — use this to drop datasets that sit
// on a Mustang domain, since those serve PPL/SQL but not the DSL aggregations APM issues.
//
// Resolves engine type with a single `bulkGet` on `data-source` saved objects. Fails open:
// if the lookup throws, an empty set is returned so callers keep showing every dataset.
export const getUnsupportedEngineDataSourceIds = async (
  dataSourceIds: string[]
): Promise<Set<string>> => {
  const unsupported = new Set<string>();
  const ids = Array.from(new Set(dataSourceIds.filter(Boolean)));
  if (UNSUPPORTED_ENGINE_TYPES.length === 0 || ids.length === 0) {
    return unsupported;
  }

  const blocked = new Set(UNSUPPORTED_ENGINE_TYPES);
  try {
    const response = await coreRefs.savedObjectsClient!.bulkGet<DataSourceAttributes>(
      ids.map((id) => ({ id, type: 'data-source' }))
    );
    for (const dataSource of response.savedObjects) {
      if (dataSource.error) {
        continue;
      }
      const engineType = dataSource.attributes?.dataSourceEngineType;
      if (engineType && blocked.has(engineType)) {
        unsupported.add(dataSource.id);
      }
    }
  } catch {
    // Data-source lookup failed — return an empty set so callers fail open.
    return new Set<string>();
  }

  return unsupported;
};
