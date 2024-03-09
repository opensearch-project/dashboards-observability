/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObject, SavedObjectUnsanitizedDoc } from '../../../../../src/core/server';

/**
 * Documents that may be the old serialization format. Only used in migrations.
 */
export interface MaybeV1SerializedIntegration extends Omit<SerializedIntegration, 'assets'> {
  assets:
    | object[]
    | {
        savedObjects?: { name: string; version: string; data: string };
        queries?: Array<{ name: string; version: string; language: string; data: string }>;
      };
}

export const migrateV1IntegrationToV2Integration = (
  doc: SavedObjectUnsanitizedDoc<MaybeV1SerializedIntegration>
): SavedObjectUnsanitizedDoc<SerializedIntegration> => {
  const integration = doc.attributes;
  // First check if there's anything to do
  if (Array.isArray(integration.assets)) {
    return doc as SavedObject<SerializedIntegration>;
  }

  // Migrate different properties separately
  const copy = { ...integration, assets: [] as SerializedIntegrationAsset[] };
  if (integration.assets.savedObjects) {
    const bundle = integration.assets.savedObjects;
    copy.assets.push({
      name: bundle.name,
      version: bundle.version,
      extension: 'ndjson',
      type: 'savedObjectBundle',
      data: bundle.data,
    });
  }
  if (integration.assets.queries) {
    copy.assets.push(
      ...integration.assets.queries.map((q) => ({
        name: q.name,
        version: q.version,
        extension: q.language,
        type: 'query' as const,
        data: q.data,
      }))
    );
  }

  return {
    ...doc,
    attributes: copy,
  };
};
