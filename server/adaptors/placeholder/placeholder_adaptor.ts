/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PlaceholderAdaptor {
  getIntegrationTemplates: (
    query?: IntegrationTemplateQuery
  ) => Promise<IntegrationTemplateSearchResult>;

  getIntegrationInstances: (
    query?: IntegrationInstanceQuery
  ) => Promise<IntegrationInstanceSearchResult>;
}
