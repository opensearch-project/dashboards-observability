/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Color, VALID_INDEX_NAME } from '../../../../common/constants/integrations';
import { HttpSetup } from '../../../../../../src/core/public';
import { coreRefs } from '../../../framework/core_refs';
import { CONSOLE_PROXY, INTEGRATIONS_BASE } from '../../../../common/constants/shared';

type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export interface IntegrationTemplate {
  name: string;
  type: string;
  assets: {
    savedObjects?: {
      name: string;
      version: string;
    };
    queries?: Array<{
      name: string;
      version: string;
      language: string;
    }>;
  };
}

export const doTypeValidation = (
  toCheck: { type?: string; properties?: object },
  required: { type?: string; properties?: object }
): ValidationResult => {
  if (!required.type) {
    return { ok: true };
  }
  if (required.type === 'object') {
    if (Boolean(toCheck.properties)) {
      return { ok: true };
    }
    return { ok: false, errors: ["'object' type must have properties."] };
  }
  if (required.type !== toCheck.type) {
    return { ok: false, errors: [`Type mismatch: '${required.type}' and '${toCheck.type}'`] };
  }
  return { ok: true };
};

export const doNestedPropertyValidation = (
  toCheck: { type?: string; properties?: { [key: string]: object } },
  required: { type?: string; properties?: { [key: string]: object } }
): ValidationResult => {
  const typeCheck = doTypeValidation(toCheck, required);
  if (!typeCheck.ok) {
    return typeCheck;
  }
  for (const property of Object.keys(required.properties ?? {})) {
    if (!Object.hasOwn(toCheck.properties ?? {}, property)) {
      return { ok: false, errors: [`Missing field '${property}'`] };
    }
    // Both are safely non-null after above checks.
    const nested = doNestedPropertyValidation(
      toCheck.properties![property],
      required.properties![property]
    );
    if (!nested.ok) {
      return nested;
    }
  }
  return { ok: true };
};

export const doPropertyValidation = (
  rootType: string,
  dataSourceProps: { [key: string]: { properties?: any } },
  requiredMappings: { [key: string]: { template: { mappings: { properties?: any } } } }
): ValidationResult => {
  // Check root object type (without dependencies)
  if (!Object.hasOwn(requiredMappings, rootType)) {
    // This is a configuration error for the integration.
    return { ok: false, errors: ['Required mapping for integration has no root type.'] };
  }
  for (const [key, value] of Object.entries(
    requiredMappings[rootType].template.mappings.properties
  )) {
    if (
      !dataSourceProps[key] ||
      !doNestedPropertyValidation(dataSourceProps[key], value as any).ok
    ) {
      return { ok: false, errors: [`Data source is invalid at key '${key}'`] };
    }
  }
  // Check nested dependencies
  for (const [key, value] of Object.entries(requiredMappings)) {
    if (key === rootType) {
      continue;
    }
    if (
      !dataSourceProps[key] ||
      !doNestedPropertyValidation(dataSourceProps[key], value.template.mappings.properties).ok
    ) {
      return { ok: false, errors: [`Data source is invalid at key '${key}'`] };
    }
  }
  return { ok: true };
};

// Returns true if the data stream is a legal name.
// Appends any additional validation errors to the provided errors array.
export const checkDataSourceName = (
  targetDataSource: string,
  integrationType: string
): ValidationResult => {
  let errors: string[] = [];
  if (!VALID_INDEX_NAME.test(targetDataSource)) {
    errors = errors.concat('This is not a valid index name.');
    return { ok: false, errors };
  }
  const nameValidity: boolean = new RegExp(`^ss4?o_${integrationType}-[^\\-]+-.+`).test(
    targetDataSource
  );
  if (!nameValidity) {
    errors = errors.concat('This index does not match the suggested naming convention.');
    return { ok: false, errors };
  }
  return { ok: true };
};

export const fetchDataSourceMappings = async (
  targetDataSource: string,
  http: HttpSetup
): Promise<{ [key: string]: { properties: any } } | null> => {
  return http
    .post(CONSOLE_PROXY, {
      query: {
        path: `${targetDataSource}/_mapping`,
        method: 'GET',
      },
    })
    .then((response) => {
      // Un-nest properties by a level for caller convenience
      Object.keys(response).forEach((key) => {
        response[key].properties = response[key].mappings.properties;
      });
      return response;
    })
    .catch((err: any) => {
      console.error(err);
      return null;
    });
};

export const fetchIntegrationMappings = async (
  targetName: string,
  http: HttpSetup
): Promise<{ [key: string]: { template: { mappings: { properties?: any } } } } | null> => {
  return http
    .get(`/api/integrations/repository/${targetName}/schema`)
    .then((response) => {
      if (response.statusCode && response.statusCode !== 200) {
        throw new Error('Failed to retrieve Integration schema', { cause: response });
      }
      return response.data.mappings;
    })
    .catch((err: any) => {
      console.error(err);
      return null;
    });
};

export const doExistingDataSourceValidation = async (
  targetDataSource: string,
  integrationName: string,
  integrationType: string
): Promise<ValidationResult> => {
  const http = coreRefs.http!;
  const dataSourceNameCheck = checkDataSourceName(targetDataSource, integrationType);
  if (!dataSourceNameCheck.ok) {
    return dataSourceNameCheck;
  }
  const [dataSourceMappings, integrationMappings] = await Promise.all([
    fetchDataSourceMappings(targetDataSource, http),
    fetchIntegrationMappings(integrationName, http),
  ]);
  if (!dataSourceMappings) {
    return { ok: false, errors: ['Provided data stream could not be retrieved'] };
  }
  if (!integrationMappings) {
    return { ok: false, errors: ['Failed to retrieve integration schema information'] };
  }
  const validationResult = Object.values(dataSourceMappings).every(
    (value) => doPropertyValidation(integrationType, value.properties, integrationMappings).ok
  );
  if (!validationResult) {
    return { ok: false, errors: ['The provided index does not match the schema'] };
  }
  return { ok: true };
};

const createComponentMapping = async (
  componentName: string,
  payload: {
    template: { mappings: { _meta: { version: string } } };
    composed_of: string[];
    index_patterns: string[];
  }
): Promise<{ [key: string]: { properties: any } } | null> => {
  const http = coreRefs.http!;
  const version = payload.template.mappings._meta.version;
  return http.post(CONSOLE_PROXY, {
    body: JSON.stringify(payload),
    query: {
      path: `_component_template/ss4o_${componentName}-${version}-template`,
      method: 'POST',
    },
  });
};

const createIndexMapping = async (
  componentName: string,
  payload: {
    template: { mappings: { _meta: { version: string } } };
    composed_of: string[];
    index_patterns: string[];
  },
  dataSourceName: string,
  integration: IntegrationTemplate
): Promise<{ [key: string]: { properties: any } } | null> => {
  const http = coreRefs.http!;
  const version = payload.template.mappings._meta.version;
  payload.index_patterns = [dataSourceName];
  return http.post(CONSOLE_PROXY, {
    body: JSON.stringify(payload),
    query: {
      path: `_index_template/ss4o_${componentName}-${integration.name}-${version}-sample`,
      method: 'POST',
    },
  });
};

const createDataSourceMappings = async (
  targetDataSource: string,
  integrationTemplateId: string,
  integration: IntegrationTemplate,
  setToast: (title: string, color?: Color, text?: string | undefined) => void
): Promise<any> => {
  const http = coreRefs.http!;
  const data = await http.get(`${INTEGRATIONS_BASE}/repository/${integrationTemplateId}/schema`);
  let error: string | null = null;
  const mappings = data.data.mappings;
  mappings[integration.type].composed_of = mappings[integration.type].composed_of.map(
    (componentName: string) => {
      const version = mappings[componentName].template.mappings._meta.version;
      return `ss4o_${componentName}-${version}-template`;
    }
  );

  try {
    // Create component mappings before the index mapping
    // The assumption is that index mapping relies on component mappings for creation
    await Promise.all(
      Object.entries(mappings).map(([key, mapping]) => {
        if (key === integration.type) {
          return Promise.resolve();
        }
        return createComponentMapping(key, mapping as any);
      })
    );
    // In order to see our changes, we need to manually provoke a refresh
    await http.post(CONSOLE_PROXY, {
      query: {
        path: '_refresh',
        method: 'GET',
      },
    });
    await createIndexMapping(
      integration.type,
      mappings[integration.type],
      targetDataSource,
      integration
    );
  } catch (err: any) {
    error = err.message;
  }

  if (error !== null) {
    setToast('Failure creating index template', 'danger', error);
  } else {
    setToast(`Successfully created index template`);
  }
};

export async function addIntegrationRequest(
  addSample: boolean,
  templateName: string,
  integrationTemplateId: string,
  integration: IntegrationTemplate,
  setToast: (title: string, color?: Color, text?: string | undefined) => void,
  name?: string,
  dataSource?: string
) {
  const http = coreRefs.http!;
  if (addSample) {
    createDataSourceMappings(
      `ss4o_${integration.type}-${integrationTemplateId}-*-sample`,
      integrationTemplateId,
      integration,
      setToast
    );
    name = `${integrationTemplateId}-sample`;
    dataSource = `ss4o_${integration.type}-${integrationTemplateId}-sample-sample`;
  }

  const response: boolean = await http
    .post(`${INTEGRATIONS_BASE}/store/${templateName}`, {
      body: JSON.stringify({ name, dataSource }),
    })
    .then((res) => {
      setToast(`${name} integration successfully added!`, 'success');
      window.location.hash = `#/installed/${res.data?.id}`;
      return true;
    })
    .catch((err) => {
      setToast('Failed to load integration', 'danger', err.message);
      return false;
    });
  if (!addSample || !response) {
    return;
  }
  const data: { sampleData: unknown[] } = await http
    .get(`${INTEGRATIONS_BASE}/repository/${templateName}/data`)
    .then((res) => res.data)
    .catch((err) => {
      console.error(err);
      setToast('Failed to load integration', 'danger', 'The sample data could not be retrieved.');
      return { sampleData: [] };
    });
  const requestBody =
    data.sampleData
      .map((record) => `{"create": { "_index": "${dataSource}" } }\n${JSON.stringify(record)}`)
      .join('\n') + '\n';
  http
    .post(CONSOLE_PROXY, {
      body: requestBody,
      query: {
        path: `${dataSource}/_bulk?refresh=wait_for`,
        method: 'POST',
      },
    })
    .catch((err) => {
      console.error(err);
      setToast('Failed to load sample data', 'danger');
    });
}
