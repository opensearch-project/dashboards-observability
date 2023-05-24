/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsBulkCreateObject } from '../../../../../src/core/server';

export interface IntegrationsAdaptor {
  getIntegrationTemplates: (
    query?: IntegrationTemplateQuery
  ) => Promise<IntegrationTemplateSearchResult>;

  getAssets: (templateName: string) => Promise<SavedObjectsBulkCreateObject[]>;

  getIntegrationInstances: (
    query?: IntegrationInstanceQuery
  ) => Promise<IntegrationInstanceSearchResult>;

  loadIntegrationInstance: (templateName: string) => Promise<IntegrationInstance>;
}
