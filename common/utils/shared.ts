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
