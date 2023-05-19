/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ILegacyScopedClusterClient } from '../../../../../src/core/server';

export class IntegrationAdaptor {
  // Fetch all existing integrations
  fetchApps = async (client: ILegacyScopedClusterClient): Promise<any[]> => {
    try {
      console.log('poopy')
      const response = await client.callAsCurrentUser('integrations.getObject');
      console.log(response)
      // return response.observabilityObjectList.map((object: any) => {
      return response
      //   return {
      //   };
      // });
    } catch (err: any) {
      throw new Error('Fetch All Applications Error: ' + err);
    }
  };

  fetchAdded = async (client: ILegacyScopedClusterClient): Promise<any[]> => {
    try {
      const response = await client.callAsCurrentUser('integrations.getAdded', {});
      console.log(response)
      // return response.observabilityObjectList.map((object: any) => {
        return response.list
      //   return {
      //   };
      // });
    } catch (err: any) {
      throw new Error('Fetch All Applications Error: ' + err);
    }
  }
}
