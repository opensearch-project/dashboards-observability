/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

type Result<T, E = Error> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; error: E; value?: undefined };

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
  statics?: IntegrationStatics;
  components: IntegrationComponent[];
  assets: IntegrationAssets;
  sampleData?: {
    path: string;
  };
}

// IntegrationConfig extended with local copies of all data
interface SerializedIntegration extends IntegrationConfig {
  statics?: SerializedIntegrationStatics;
  components: SerializedIntegrationComponent[];
  assets: SerializedIntegrationAssets;
  sampleData?: {
    path: string;
    data: string;
  };
}

interface IntegrationStatics {
  logo?: StaticAsset;
  gallery?: StaticAsset[];
  darkModeLogo?: StaticAsset;
  darkModeGallery?: StaticAsset[];
}

interface SerializedIntegrationStatics {
  logo?: SerializedStaticAsset;
  gallery?: SerializedStaticAsset[];
  darkModeLogo?: SerializedStaticAsset;
  darkModeGallery?: SerializedStaticAsset[];
}

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

interface ParsedIntegrationAssets {
  savedObjects?: object[];
  queries?: Array<{
    query: string;
    language: string;
  }>;
}

interface SerializedIntegrationAssets extends IntegrationAssets {
  savedObjects?: {
    name: string;
    version: string;
    data: string;
  };
  queries?: Array<{
    name: string;
    version: string;
    language: string;
    data: string;
  }>;
}

interface StaticAsset {
  annotation?: string;
  path: string;
}

interface SerializedStaticAsset extends StaticAsset {
  data: string;
}

interface IntegrationComponent {
  name: string;
  version: string;
}

interface SerializedIntegrationComponent extends IntegrationComponent {
  data: string;
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
