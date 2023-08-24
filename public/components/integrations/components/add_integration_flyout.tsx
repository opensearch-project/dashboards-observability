/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash';
import {
  EuiButton,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiText,
  EuiLink,
  EuiFormRow,
  EuiTitle,
} from '@elastic/eui';
import React, { useState } from 'react';
import { HttpSetup, HttpStart } from '../../../../../../src/core/public';
import { useToast } from '../../../../public/components/common/toast';

interface IntegrationFlyoutProps {
  onClose: () => void;
  onCreate: (name: string, dataSource: string) => void;
  integrationName: string;
  integrationType: string;
  http: HttpStart;
}

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
  if (!Boolean(targetDataSource.match(/^[a-z\d\.][a-z\d\._\-\*]*$/))) {
    errors = errors.concat('This is not a valid index name.');
    return { ok: false, errors };
  }
  const nameValidity: boolean = Boolean(
    targetDataSource.match(new RegExp(`^ss4o_${integrationType}-[^\\-]+-[^\\-]+`))
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
): Promise<string[]> => {
  const dataSourceNameCheck = checkDataSourceName(targetDataSource, integrationType);
  if (!dataSourceNameCheck.ok) {
    return dataSourceNameCheck.errors;
  }
  const [dataSourceMappings, integrationMappings] = await Promise.all([
    fetchDataSourceMappings(targetDataSource, http),
    fetchIntegrationMappings(integrationName, http),
  ]);
  if (!dataSourceMappings) {
    return ['Provided data stream could not be retrieved'];
  }
  if (!integrationMappings) {
    return ['Failed to retrieve integration schema information'];
  }
  const validationResult = Object.values(dataSourceMappings).every(
    (value) => doPropertyValidation(integrationType, value.properties, integrationMappings).ok
  );
  if (!validationResult) {
    return ['The provided index does not match the schema'];
  }
  return [];
};

export function AddIntegrationFlyout(props: IntegrationFlyoutProps) {
  const { onClose, onCreate, integrationName, integrationType, http } = props;

  const [isDataSourceValid, setDataSourceValid] = useState<null | false | true>(null);

  const { setToast } = useToast();

  const [name, setName] = useState(integrationName || ''); // sets input value
  const [dataSource, setDataSource] = useState('');

  const onDatasourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDataSource(e.target.value);
  };

  const [errors, setErrors] = useState<string[]>([]);

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const formContent = () => {
    return (
      <div>
        <EuiFormRow
          label="Index name or wildcard pattern"
          helpText="Input an index name or wildcard pattern that your integration will query."
          isInvalid={isDataSourceValid === false}
          error={errors}
          labelAppend={
            <EuiText size="xs">
              <EuiLink
                href="https://opensearch.org/docs/latest/integrations/index"
                external={true}
                target="_blank"
              >
                Learn More
              </EuiLink>
            </EuiText>
          }
        >
          <EuiFieldText
            data-test-subj="data-source-name"
            name="first"
            onChange={(e) => onDatasourceChange(e)}
            value={dataSource}
            isInvalid={isDataSourceValid === false}
            append={
              <EuiButton
                data-test-subj="validateIndex"
                onClick={async () => {
                  const validationResult = await doExistingDataSourceValidation(
                    dataSource,
                    integrationName,
                    integrationType,
                    http
                  );
                  setErrors(validationResult);
                  if (validationResult.length === 0) {
                    setToast('Index name or wildcard pattern is valid', 'success');
                  }
                  setDataSourceValid(validationResult.length === 0);
                }}
                disabled={dataSource.length === 0}
              >
                Validate
              </EuiButton>
            }
          />
        </EuiFormRow>
        <EuiFormRow label="Name" helpText="This will be used to label the newly added integration.">
          <EuiFieldText
            data-test-subj="new-instance-name"
            name="first"
            onChange={(e) => onNameChange(e)}
            value={name}
          />
        </EuiFormRow>
      </div>
    );
  };

  const renderContent = () => {
    return (
      <>
        <EuiForm component="form">{formContent()}</EuiForm>
      </>
    );
  };

  return (
    <EuiFlyout data-test-subj="addIntegrationFlyout" onClose={onClose} size="s">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle data-test-subj="addIntegrationFlyoutTitle">
          <h2>Add Integration</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>{renderContent()}</EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiButton onClick={() => onClose()} color="danger">
              Cancel
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiButton
              onClick={() => {
                onCreate(name, dataSource);
                onClose();
              }}
              fill
              disabled={
                dataSource.length < 1 ||
                dataSource.length > 50 ||
                name.length < 1 ||
                name.length > 50 ||
                isDataSourceValid !== true
              }
              data-test-subj="createInstanceButton"
              data-click-metric-element="integrations.create_from_setup"
            >
              Add Integration
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
}
