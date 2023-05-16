/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ILegacyScopedClusterClient } from '../../../../../src/core/server';

export class PlaceholderAdaptor {
  // Fetch all existing integrations
  getIntegrationTemplates = async (
    client: ILegacyScopedClusterClient,
    query: IntegrationTemplateQuery | null
  ): Promise<IntegrationTemplate[]> => {
    try {
      console.log('getIntegrationTemplates query: ' + query);
      const response = await client.callAsCurrentUser('integrations.getIntegrationTemplates');
      console.log('getIntegrationTemplates response: ' + response);
      return response;
    } catch (err: any) {
      throw new Error('Fetch All Applications Error: ' + err);
    }
  };

  getIntegrationInstances = async (
    client: ILegacyScopedClusterClient,
    query: IntegrationInstanceQuery | null
  ): Promise<IntegrationInstance[]> => {
    try {
      let endpoint: string = 'integrations.getAdded';
      if (query && query.added) {
        endpoint = 'integrations.getAddedPop';
      }
      console.log('getIntegrationInstances query: ' + query);
      const response = await client.callAsCurrentUser(endpoint, {});
      console.log('getIntegrationInstances response: ' + response);
      return response.test;
    } catch (err: any) {
      throw new Error('Fetch Added Applications Error: ' + err);
    }
  };
}
