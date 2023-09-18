/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { HttpSetup } from '../../../../../../src/core/public';

type ValidationResult = { ok: true } | { ok: false; errors: string[] };

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
  if (!/^[a-z\d\.][a-z\d\._\-\*]*$/.test(targetDataSource)) {
    errors = errors.concat('This is not a valid index name.');
    return { ok: false, errors };
  }
  const nameValidity: boolean = new RegExp(`^ss4o_${integrationType}-[^\\-]+-[^\\-]+`).test(
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
    .post('/api/console/proxy', {
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
  integrationType: string,
  http: HttpSetup
): Promise<ValidationResult> => {
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
