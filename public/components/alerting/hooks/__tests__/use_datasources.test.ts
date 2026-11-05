/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mapSavedObjectsToDatasources } from '../use_datasources';

const MDS_SOURCE = {
  id: 'os-1',
  type: 'data-source',
  references: [],
  attributes: { title: 'Cluster 1', endpoint: 'https://example.com' },
};
describe('mapSavedObjectsToDatasources', () => {
  it('offers the Local Cluster placeholder when no MDS data source exists', () => {
    expect(mapSavedObjectsToDatasources([], []).map((d) => d.id)).toEqual(['local-cluster']);
  });
  it('never offers the Local Cluster placeholder where the deployment hides it', () => {
    expect(mapSavedObjectsToDatasources([], [], { hideLocalCluster: true })).toEqual([]);
    // Registered data sources are listed either way.
    expect(
      mapSavedObjectsToDatasources([MDS_SOURCE] as never, [], { hideLocalCluster: true }).map(
        (d) => d.id
      )
    ).toEqual(['os-1']);
  });
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
