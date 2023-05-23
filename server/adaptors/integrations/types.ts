interface IntegrationTemplate {
  name: string;
  version: string;
  integrationType: string;
  author?: string;
  description?: string;
  tags?: string[];
  sourceUrl?: string;
  catalog?: string;
  statics?: IntegrationStatics;
  components: IntegrationComponent[]; // Describes expected format of the data, used for validation
  displayAssets: IntegrationAsset[]; // Asset objects that can be imported
}

class IntegrationStatics {
  mapping?: StaticAssetMapping;
  assets?: StaticAsset[];

  getLogo(darkMode?: boolean): StaticAsset | undefined {
    if (darkMode && this.mapping?.darkModeLogo) {
      return this.getAsset(this.mapping?.darkModeLogo);
    }
    if (this.mapping?.logo) {
      return this.getAsset(this.mapping?.logo);
    }
  }

  getGallery(darkMode?: boolean): StaticAsset[] {
    if (darkMode && this.mapping?.darkModeGallery) {
      return this.mapping.darkModeGallery
        .map((path) => this.getAsset(path))
        .filter((x) => x) as StaticAsset[];
    }
    if (this.mapping?.gallery) {
      return this.mapping.gallery
        .map((path) => this.getAsset(path))
        .filter((x) => x) as StaticAsset[];
    }
    return [];
  }

  getAsset(path: string): StaticAsset | undefined {
    for (const asset of this.assets?.values() ?? []) {
      if (asset.path === path) {
        return asset;
      }
    }
  }
}

interface StaticAssetMapping {
  logo?: string;
  gallery?: string[];
  darkModeLogo?: string; // Fallback to light mode if absent
  darkModeGallery?: string[];
}

interface StaticAsset {
  path: string;
  mimeType: string;
  annotation?: string;
  data: string; // Base64 encoded
}

interface IntegrationComponent {
  name: string;
  version: string;
  description?: string;
  sourceUrl?: string;
  schemaBody: string;
  mappingBody: string;
}

interface IntegrationAsset {
  assetBody: string;
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
  integrationType: string;
  dataSource: string;
  creationDate: string;
  tags?: string[];
  status: string; // Dynamically computed status on read
  assets: AssetReference[]; // References to imported assets
}

interface AssetReference {
  assetType: string;
  assetUrl: string;
  status: string; // Aggregated to show status in parent object
  isDefaultAsset: boolean; // Used to know which one to open by default
}

interface IntegrationInstanceSearchResult {
  hits: IntegrationInstance[];
}

interface IntegrationInstanceQuery {
  added?: boolean;
}
