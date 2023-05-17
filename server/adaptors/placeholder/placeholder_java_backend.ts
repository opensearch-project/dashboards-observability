import { ILegacyScopedClusterClient } from '../../../../../src/core/server';

export class PlaceholderJavaBackend {
  client: ILegacyScopedClusterClient;

  constructor(client: ILegacyScopedClusterClient) {
    this.client = client;
  }

  // Fetch all existing integrations
  getIntegrationTemplates = async (
    query: IntegrationTemplateQuery | null
  ): Promise<IntegrationTemplate[]> => {
    try {
      console.log('getIntegrationTemplates query: ' + query);
      const response = await this.client.callAsCurrentUser('integrations.getIntegrationTemplates');
      console.log('getIntegrationTemplates response: ' + response);
      return response;
    } catch (err: any) {
      throw new Error('Fetch All Applications Error: ' + err);
    }
  };

  getIntegrationInstances = async (
    query: IntegrationInstanceQuery | null
  ): Promise<IntegrationInstance[]> => {
    try {
      let endpoint: string = 'integrations.getAdded';
      if (query && query.added) {
        endpoint = 'integrations.getAddedPop';
      }
      console.log('getIntegrationInstances query: ' + query);
      const response = await this.client.callAsCurrentUser(endpoint, {});
      console.log('getIntegrationInstances response: ' + response);
      return response.test;
    } catch (err: any) {
      throw new Error('Fetch Added Applications Error: ' + err);
    }
  };
}
