interface IntegrationTemplate {
  templateName: string;
  version: string;
  description: string;
  catalog: string;
  assetUrl: string;
}

interface IntegrationTemplateSearchResult {
  integrations: IntegrationTemplate[];
}

interface IntegrationTemplateQuery {
  name?: string; // Temporary value to satisfy linter, don't use
}

interface IntegrationInstance {
  templateName: string;
  type: string;
  dataset: string;
  namespace: string;
  id: string;
  version: string;
  description: string;
  template: string;
  creationDate: string;
  author: string;
  status: string;
  dashboardUrl: string;
  assets: object;
}

interface IntegrationInstanceSearchResult {
  integrations: IntegrationInstance[];
}

interface IntegrationInstanceQuery {
  added?: boolean;
}
