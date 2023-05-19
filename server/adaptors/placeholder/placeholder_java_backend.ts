import { reject } from 'lodash';
import {
  ILegacyScopedClusterClient,
  SavedObjectsBulkCreateObject,
} from '../../../../../src/core/server';
import { PlaceholderAdaptor } from './placeholder_adaptor';

export class PlaceholderJavaBackend implements PlaceholderAdaptor {
  client: ILegacyScopedClusterClient;

  constructor(client: ILegacyScopedClusterClient) {
    this.client = client;
  }

  // Fetch all existing integrations
  getIntegrationTemplates = async (
    query?: IntegrationTemplateQuery
  ): Promise<IntegrationTemplateSearchResult> => {
    try {
      console.log(`getIntegrationTemplates query: ${query}`);
      const response = await this.client.callAsCurrentUser('integrations.getIntegrationTemplates');
      console.log(`getIntegrationTemplates response: ${response}`);
      console.log(response);
      return response;
    } catch (err: any) {
      throw new Error('Fetch All Applications Error: ' + err);
    }
  };

  getIntegrationInstances = async (
    query?: IntegrationInstanceQuery
  ): Promise<IntegrationInstanceSearchResult> => {
    try {
      let endpoint: string = 'integrations.getAdded';
      if (query?.added) {
        endpoint = 'integrations.getAddedPop';
      }
      console.log('getIntegrationInstances query: ' + query);
      const response = await this.client.callAsCurrentUser(endpoint, {});
      console.log('getIntegrationInstances response:');
      console.log(response);
      return response.test;
    } catch (err: any) {
      throw new Error('Fetch Added Applications Error: ' + err);
    }
  };

  getAssets = async (_: any): Promise<SavedObjectsBulkCreateObject[]> => {
    return Promise.reject('not implemented');
  };
}
