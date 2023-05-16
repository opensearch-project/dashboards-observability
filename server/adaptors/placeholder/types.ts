interface IntegrationTemplate {
  name: string;
  description: string;
  url: string;
}

interface IntegrationTemplateQuery {
  name: string | null;
}

interface IntegrationInstance {
  name: string;
  description: string;
  url: string;
}

interface IntegrationInstanceQuery {
  added: boolean | null;
}
