interface IntegrationTemplate {
  name: string;
  version: string;
  integrationType: string;
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
    assets?: Map<
      string,
      {
        mimeType: string;
        annotation?: string;
        data: string;
      }
    >;
  };
  components: IntegrationComponent[];
  displayAssets: DisplayAsset[];
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
  id: string;
  name: string;
  templateName: string;
  dataSource: {
    sourceType: string;
    dataset: string;
    namespace: string;
  };
  creationDate: string;
  tags?: string[];
  status: string;
  assets: AssetReference[];
}

interface AssetReference {
  assetType: string;
  assetUrl: string;
  status: string;
  isDefaultAsset: boolean;
}

interface IntegrationInstanceSearchResult {
  hits: IntegrationInstance[];
}

interface IntegrationInstanceQuery {
  added?: boolean;
}
