/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

type Result<T, E = Error> =
  | { ok: true; value: T; error?: undefined }
  | { ok: false; error: E; value?: undefined };

type SupportedAssetType = 'savedObjectBundle' | 'query';

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
  workflows?: IntegrationWorkflow[];
  statics?: IntegrationStatics;
  components: IntegrationComponent[];
  assets: IntegrationAsset[];
  sampleData?: {
    path: string;
  };
}

// IntegrationConfig extended with local copies of all data
interface SerializedIntegration extends IntegrationConfig {
  statics?: SerializedIntegrationStatics;
  components: SerializedIntegrationComponent[];
  assets: SerializedIntegrationAsset[];
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

interface IntegrationAsset {
  name: string;
  version: string;
  extension: string;
  type: SupportedAssetType;
  workflows?: string[];
}

interface IntegrationWorkflow {
  name: string;
  label: string;
  description: string;
  enabled_by_default: boolean;
  applicable_data_sources?: string[];
}

type ParsedIntegrationAsset =
  | { type: 'savedObjectBundle'; workflows?: string[]; data: object[] }
  | { type: 'query'; workflows?: string[]; query: string; language: string };

interface SerializedIntegrationAsset extends IntegrationAsset {
  data: string;
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
  references?: [];
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
  status?: string;
}

interface IntegrationInstancesSearchResult {
  hits: IntegrationInstanceResult[];
}

interface IntegrationInstanceQuery {
  added?: boolean;
  id?: string;
}
