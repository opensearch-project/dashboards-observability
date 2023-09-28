/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

interface IntegrationAssets {
  savedObjects?: {
    name: string;
    version: string;
  };
  queries?: Array<{
    name: string;
    version: string;
    language: string;
  }>;
}

interface IntegrationConfig {
  name: string;
  version: string;
  displayName?: string;
  license: string;
  type: string;
  labels?: string[];
  author?: string;
  description?: string;
  sourceUrl?: string;
  statics?: {
    logo?: StaticAsset;
    gallery?: StaticAsset[];
    darkModeLogo?: StaticAsset;
    darkModeGallery?: StaticAsset[];
  };
  components: IntegrationComponent[];
  assets: IntegrationAssets;
  sampleData?: {
    path: string;
  };
}

interface StaticAsset {
  annotation?: string;
  path: string;
}

interface IntegrationComponent {
  name: string;
  version: string;
}

interface DisplayAsset {
  body: string;
}

interface IntegrationTemplateSearchResult {
  hits: IntegrationConfig[];
}

interface IntegrationTemplateQuery {
  name?: string;
}

interface IntegrationInstance {
  name: string;
  templateName: string;
  dataSource: string;
  creationDate: string;
  assets: AssetReference[];
}

interface IntegrationInstanceResult extends IntegrationInstance {
  id: string;
  status: string;
}

interface AssetReference {
  assetType: string;
  assetId: string;
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
