/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mapSavedObjectsToDatasources } from '../use_datasources';

describe('mapSavedObjectsToDatasources', () => {
  it('preserves OpenSearch engine metadata used by AD and Forecasting create gating', () => {
    const datasources = mapSavedObjectsToDatasources(
      [
        {
          id: 'os-1',
          type: 'data-source',
          references: [],
          attributes: {
            title: 'Serverless',
            endpoint: 'https://example.aoss.amazonaws.com',
            dataSourceEngineType: 'OpenSearch Serverless',
          },
        },
      ] as never,
      []
    );

    expect(datasources[0]).toEqual(
      expect.objectContaining({
        id: 'os-1',
        mdsId: 'os-1',
        engineType: 'OpenSearch Serverless',
      })
    );
  });
});
