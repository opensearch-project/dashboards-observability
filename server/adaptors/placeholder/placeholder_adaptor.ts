/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ILegacyScopedClusterClient } from '../../../../../src/core/server';

export class PlaceholderAdaptor {
  // Fetch all existing integrations
  fetchApps = async (client: ILegacyScopedClusterClient): Promise<any[]> => {
    try {
      console.log('poopy');
      const response = await client.callAsCurrentUser('integrations.getObject');
      console.log(response);
      return response;
    } catch (err: any) {
      throw new Error('Fetch All Applications Error: ' + err);
    }
  };

  fetchAdded = async (
    client: ILegacyScopedClusterClient,
    added: boolean = false
  ): Promise<any[]> => {
    try {
      const endpoint = added ? 'integrations.getAddedPop' : 'integrations.getAdded';
      const response = await client.callAsCurrentUser(endpoint, {});
      console.log(response);
      return response.test;
    } catch (err: any) {
      throw new Error('Fetch Added Applications Error: ' + err);
    }
  };
}
