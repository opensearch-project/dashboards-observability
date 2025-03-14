/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Readable } from 'stream';
import { createSavedObjectsStreamFromNdJson } from '../../../../../../src/core/server/saved_objects/routes/utils';
import { IntegrationReader } from './integration_reader';

export async function tryParseNDJson(content: string): Promise<object[] | null> {
  try {
    const objects = await createSavedObjectsStreamFromNdJson(Readable.from(content));
    return await objects.toArray();
  } catch (err) {
    return null;
  }
}

/**
 * Check IntegrationReader nested dependencies for validity,
 * as a supplement to shallow config validation.
 *
 * @returns a Result indicating whether the integration is valid, holding the integration's config.
 */
export async function deepCheck(reader: IntegrationReader): Promise<Result<IntegrationConfig>> {
  const configResult = await reader.getConfig();
  if (!configResult.ok) {
    return configResult;
  }

  // Deep checks not included in default config validation
  const assets = await reader.getAssets();
  // Check if there was an error retrieving assets
  if (!assets.ok) {
    return {
      ok: false,
      error: new Error(`Failed to process assets while loading: ${assets.error.message}`),
    };
  }
  // Validate that at least one asset exists for the integration
  if (assets.value.length === 0) {
    return { ok: false, error: new Error('An integration must have at least one asset') };
  }

  return configResult;
}

/**
 * Helper method: Convert an Array<Result<type>> to Result<Array<type>>.
 *
 * @param results The list of results to fold.
 * @returns A single result object with values in an array, or an error result.
 */
export const foldResults = <T>(results: Array<Result<T>>) =>
  results.reduce(
    (result, currentValue) => {
      if (!result.ok) {
        return result;
      }
      if (!currentValue.ok) {
        return currentValue;
      }
      result.value.push(currentValue.value);
      return result;
    },
    { ok: true, value: [] } as Result<T[]>
  );

/**
 * Remove all fields from SerializedIntegration not present in IntegrationConfig.
 *
 * @param rawConfig The raw config to prune
 * @returns A config with all data fields removed
 */
export const pruneConfig = (
  rawConfig: IntegrationConfig | SerializedIntegration
): IntegrationConfig => {
  // Hacky workaround: we currently only need to prune 'data' fields, so just remove every 'data'.
  // Lots of risky conversion in this method, so scope it to here and rewrite if more granular
  // pruning is needed.
  const prunePart = <T>(part: T): T => {
    const result = {} as { [key: string]: unknown };
    for (const [key, value] of Object.entries(part as { [key: string]: unknown })) {
      if (key === 'data') {
        continue;
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) => {
          if (item instanceof Object && item !== null) {
            return prunePart(item);
          }
          return item;
        });
      } else if (value instanceof Object && value !== null) {
        result[key] = prunePart(value as { [key: string]: unknown });
      } else {
        result[key] = value;
      }
    }
    return (result as unknown) as T;
  };

  return prunePart(rawConfig);
};
