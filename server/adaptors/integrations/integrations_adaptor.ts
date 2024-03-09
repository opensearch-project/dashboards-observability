/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface IntegrationsAdaptor {
  getIntegrationTemplates: (
    query?: IntegrationTemplateQuery
  ) => Promise<IntegrationTemplateSearchResult>;

  getIntegrationInstances: (
    query?: IntegrationInstanceQuery
  ) => Promise<IntegrationInstancesSearchResult>;

  getIntegrationInstance: (query?: IntegrationInstanceQuery) => Promise<IntegrationInstanceResult>;

  loadIntegrationInstance: (
    templateName: string,
    name: string,
    dataSource: string
  ) => Promise<IntegrationInstance>;

  deleteIntegrationInstance: (id: string) => Promise<unknown>;

  getStatic: (templateName: string, path: string) => Promise<Buffer>;

  getSchemas: (templateName: string) => Promise<{ mappings: { [key: string]: unknown } }>;

  getAssets: (templateName: string) => Promise<ParsedIntegrationAsset[]>;

  getSampleData: (templateName: string) => Promise<{ sampleData: object[] | null }>;
}
