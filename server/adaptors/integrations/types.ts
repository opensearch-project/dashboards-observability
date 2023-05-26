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
  tags?: string[];
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
  addedBy?: string;
  assets: AssetReference[];
}

interface AssetReference {
  assetType: string;
  assetId: string;
  status: string;
  isDefaultAsset: boolean;
}

interface IntegrationInstanceSearchResult {
  hits: IntegrationInstance[];
}

interface IntegrationInstanceQuery {
  added?: boolean;
}
