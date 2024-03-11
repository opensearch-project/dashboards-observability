/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybeV1SerializedIntegration, migrateV1IntegrationToV2Integration } from '../migrations';
import { SavedObjectUnsanitizedDoc } from '../../../../../../src/core/server';
import { TEST_INTEGRATION_CONFIG } from '../../../../test/constants';

describe('migrateV1IntegrationToV2Integration', () => {
  it('should return the same document if assets are already in V2 format', () => {
    const doc = {
      type: 'integration-template',
      attributes: TEST_INTEGRATION_CONFIG as SerializedIntegration,
    };

    const migratedDoc = migrateV1IntegrationToV2Integration(doc);

    expect(migratedDoc).toEqual(doc);
  });

  it('should migrate V1 assets to V2 format', () => {
    const doc: SavedObjectUnsanitizedDoc<MaybeV1SerializedIntegration> = {
      type: 'integration-template',
      attributes: {
        ...(TEST_INTEGRATION_CONFIG as SerializedIntegration),
        assets: {
          savedObjects: {
            name: 'testSavedObject',
            version: '1.0.0',
            data: '{"id":"1","type":"test"}',
          },
          queries: [
            {
              name: 'testQuery',
              version: '1.0.0',
              language: 'sql',
              data: 'SELECT * FROM test',
            },
          ],
        },
      },
    };

    const migratedDoc = migrateV1IntegrationToV2Integration(doc);

    expect(migratedDoc).toEqual({
      ...doc,
      attributes: {
        ...doc.attributes,
        assets: [
          {
            name: 'testSavedObject',
            version: '1.0.0',
            extension: 'ndjson',
            type: 'savedObjectBundle',
            data: '{"id":"1","type":"test"}',
          },
          {
            name: 'testQuery',
            version: '1.0.0',
            extension: 'sql',
            type: 'query',
            data: 'SELECT * FROM test',
          },
        ],
      },
    });
  });
});
