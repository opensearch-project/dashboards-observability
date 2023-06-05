/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

interface IntegrationTemplate {
  name: string;
  version: string;
  integrationType: string;
  license: string;
  author?: string;
  description?: string;
  tags?: string[];
  sourceUrl?: string;
  statics?: {
    mapping?: {
      logo?: string;
      gallery?: string[];
      darkModeLogo?: string; // Fallback to light mode if absent
      darkModeGallery?: string[];
    };
    assets?: {
      [key: string]: StaticAsset;
    };
  };
  components: IntegrationComponent[];
  displayAssets: DisplayAsset[];
}

interface StaticAsset {
  mimeType: string;
  annotation?: string;
  data: string;
}

interface IntegrationComponent {
  name: string;
  version: string;
  description?: string;
  sourceUrl?: string;
  schemaBody: string;
  mappingBody: string;
}

interface DisplayAsset {
  body: string;
}

interface IntegrationTemplateSearchResult {
  hits: IntegrationTemplate[];
}

interface IntegrationTemplateQuery {
  name?: string;
}

interface IntegrationInstance {
  name: string;
  templateName: string;
  dataSource: {
    sourceType: string;
    dataset: string;
    namespace: string;
  };
  creationDate: Date;
  tags?: string[];
  status: string;
  assets: AssetReference[];
}

interface IntegrationInstanceResult {
  name: string;
  templateName: string;
  dataSource: {
    sourceType: string;
    dataset: string;
    namespace: string;
  };
  creationDate: Date;
  tags?: string[];
  status: string;
  assets: AssetReference[];
  id: string;
}

interface AssetReference {
  assetType: string;
  assetId: string;
  status: string;
  isDefaultAsset: boolean;
  description: string;
}

interface IntegrationInstancesSearchResult {
  hits: IntegrationInstanceResult[];
}

interface IntegrationInstanceQuery {
  added?: boolean;
  id?: string;
}
