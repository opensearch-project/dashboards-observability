/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PlaceholderAdaptor {
  getIntegrationTemplates: (
    query: IntegrationTemplateQuery | null
  ) => Promise<IntegrationTemplate[]>;

  getIntegrationInstances: (
    query: IntegrationInstanceQuery | null
  ) => Promise<IntegrationInstance[]>;
}
