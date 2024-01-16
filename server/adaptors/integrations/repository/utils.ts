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
  if (!assets.ok || Object.keys(assets.value).length === 0) {
    return { ok: false, error: new Error('An integration must have at least one asset') };
  }

  return configResult;
}
