/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Readable } from 'stream';
import { createSavedObjectsStreamFromNdJson } from '../../../../../../src/core/server/saved_objects/routes/utils';

export async function tryParseNDJson(content: string): Promise<object[] | null> {
  try {
    const objects = await createSavedObjectsStreamFromNdJson(Readable.from(content));
    return await objects.toArray();
  } catch (err) {
    return null;
  }
}
