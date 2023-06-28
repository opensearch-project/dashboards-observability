/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash';
import {
  EuiButton,
  EuiCallOut,
  EuiCheckbox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiLink,
  EuiRadioGroup,
  EuiSpacer,
  EuiSuperSelect,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React, { Fragment, useState } from 'react';
import { HttpStart } from '../../../../../../src/core/public';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { useToast } from '../../../../public/components/common/toast';

interface IntegrationFlyoutProps {
  onClose: () => void;
  onCreate: (name: string, dataSource: string) => void;
  integrationName: string;
  integrationType: string;
  http: HttpStart;
}

export const doTypeValidation = (toCheck: any, required: any): boolean => {
  if (!required.type) {
    return true;
  }
  if (required.type === 'object') {
    return Boolean(toCheck.properties);
  }
  return required.type === toCheck.type;
};

export const doNestedPropertyValidation = (
  toCheck: { type?: string; properties?: any },
  required: { type?: string; properties?: any }
): boolean => {
  if (!doTypeValidation(toCheck, required)) {
    return false;
  }
  if (required.properties) {
    return Object.keys(required.properties).every((property: string) => {
      if (!toCheck.properties[property]) {
        return false;
      }
      return doNestedPropertyValidation(
        toCheck.properties[property],
        required.properties[property]
      );
    });
  }
  return true;
};

export const doPropertyValidation = (
  rootType: string,
  dataSourceProps: { [key: string]: { properties?: any } },
  requiredMappings: { [key: string]: { template: { mappings: { properties?: any } } } }
): boolean => {
  // Check root object type (without dependencies)
  for (const [key, value] of Object.entries(
    requiredMappings[rootType].template.mappings.properties
  )) {
    if (!dataSourceProps[key] || !doNestedPropertyValidation(dataSourceProps[key], value as any)) {
      return false;
    }
  }
  // Check nested dependencies
  for (const [key, value] of Object.entries(requiredMappings)) {
    if (key === rootType) {
      continue;
    }
    if (
      !dataSourceProps[key] ||
      !doNestedPropertyValidation(dataSourceProps[key], value.template.mappings.properties)
    ) {
      return false;
    }
  }
  return true;
};

export function AddIntegrationFlyout(props: IntegrationFlyoutProps) {
  const { onClose, onCreate, integrationName, integrationType } = props;

  const { setToast } = useToast();

  const [checked, setChecked] = useState(false);

  const [isDataSourceValid, setDataSourceValid] = useState(true);

  const [isCreateDatasourceValid, setCreateDataSourceValid] = useState(true);

  const [name, setName] = useState(integrationName || ''); // sets input value
  const [dataSource, setDataSource] = useState('');

  const [createDataSource, setCreateDataSource] = useState('');

  const onDatasourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDataSource(e.target.value);
  };

  const onCheckChange = (e: any) => {
    setChecked(e.target.checked);
  };

  const onCreateDatasourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCreateDataSource(e.target.value);
  };

  const [errors, setErrors] = useState<string[]>([]);

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const createDataSourceMappings = async (targetDataSource: string): Promise<any> => {
    const data = await fetch(`${INTEGRATIONS_BASE}/repository/${integrationName}/schema`).then(
      (response) => {
        return response.json();
      }
    );
    let error = null;

    for (const [key, mapping] of Object.entries(data.data.mappings)) {
      const result = await createMappings(key, mapping, targetDataSource);

      if (result && result.error) {
        error = (result.error as any).reason;
      }
    }

    if (error !== null) {
      setToast('Failure creating index template', 'danger', error);
    } else {
      setToast(`Successfully created index template`);
    }
  };

  // Returns true if the data stream is a legal name.
  // Appends any additional validation errors to the provided errors array.
  const checkDataSourceName = (targetDataSource: string, validationErrors: string[]): boolean => {
    if (!Boolean(targetDataSource.match(/^[a-z\d\.][a-z\d\._\-\*]*$/))) {
      validationErrors.push('This is not a valid index name.');
      setErrors(validationErrors);
      return false;
    }
    const nameValidity: boolean = Boolean(
      targetDataSource.match(new RegExp(`^ss4o_${integrationType}-[^\\-]+-[^\\-]+`))
    );
    if (!nameValidity) {
      validationErrors.push('This index does not match the suggested naming convention.');
      setErrors(validationErrors);
    }
    return true;
  };

  const fetchDataSourceMappings = async (
    targetDataSource: string
  ): Promise<{ [key: string]: { properties: any } } | null> => {
    return fetch(`/api/console/proxy?path=${targetDataSource}/_mapping&method=GET`, {
      method: 'POST',
      headers: [['osd-xsrf', 'true']],
    })
      .then((response) => response.json())
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

  const createMappings = async (
    componentName: string,
    payload: any,
    dataSourceName: string
  ): Promise<{ [key: string]: { properties: any } } | null> => {
    if (componentName !== integrationType) {
      return fetch(
        `/api/console/proxy?path=_component_template/${componentName}_template&method=POST`,
        {
          method: 'POST',
          headers: [
            ['osd-xsrf', 'true'],
            ['Content-Type', 'application/json'],
          ],
          body: JSON.stringify(payload),
        }
      )
        .then((response) => response.json())
        .catch((err: any) => {
          console.error(err);
          return err;
        });
    } else {
      payload.index_patterns = [dataSourceName];
      return fetch(`/api/console/proxy?path=_index_template/${componentName}&method=POST`, {
        method: 'POST',
        headers: [
          ['osd-xsrf', 'true'],
          ['Content-Type', 'application/json'],
        ],
        body: JSON.stringify(payload),
      })
        .then((response) => response.json())
        .catch((err: any) => {
          console.error(err);
          return err;
        });
    }
  };

  const fetchIntegrationMappings = async (
    targetName: string
  ): Promise<{ [key: string]: { template: { mappings: { properties?: any } } } } | null> => {
    return fetch(`/api/integrations/repository/${targetName}/schema`)
      .then((response) => response.json())
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

  const doExistingDataSourceValidation = async (targetDataSource: string): Promise<boolean> => {
    const validationErrors: string[] = [];
    if (!checkDataSourceName(targetDataSource, validationErrors)) {
      return false;
    }
    const [dataSourceMappings, integrationMappings] = await Promise.all([
      fetchDataSourceMappings(targetDataSource),
      fetchIntegrationMappings(name),
    ]);
    if (!dataSourceMappings) {
      validationErrors.push('Provided data stream could not be retrieved');
      setErrors(validationErrors);
      return false;
    }
    if (!integrationMappings) {
      validationErrors.push('Failed to retrieve integration schema information');
      setErrors(validationErrors);
      return false;
    }
    const validationResult = Object.values(dataSourceMappings).every((value) =>
      doPropertyValidation(integrationType, value.properties, integrationMappings)
    );
    if (!validationResult) {
      validationErrors.push('The provided index does not match the schema');
      setErrors(validationErrors);
    }
    return validationResult;
  };

  const formContent = () => {
    switch (radioIdSelected) {
      case '0':
        return (
          <div>
            <EuiFormRow
              label="Index name or wildcard pattern"
              helpText="Input an index name or wildcard pattern that your integration will query."
              isInvalid={!isDataSourceValid}
              error={errors}
            >
              <EuiFieldText
                data-test-subj="datasource-name"
                name="first"
                onChange={(e) => onDatasourceChange(e)}
                value={dataSource}
                isInvalid={!isDataSourceValid}
                append={
                  <EuiButton
                    data-test-subj="resetCustomEmbeddablePanelTitle"
                    onClick={async () => {
                      const validationResult = await doExistingDataSourceValidation(dataSource);
                      setDataSourceValid(validationResult);
                    }}
                    disabled={dataSource.length === 0}
                  >
                    Validate
                  </EuiButton>
                }
              />
            </EuiFormRow>
            <EuiFormRow
              label="Name"
              helpText="This will be used to label the newly added integration."
            >
              <EuiFieldText
                data-test-subj="new-instance-name"
                name="first"
                onChange={(e) => onNameChange(e)}
                value={name}
              />
            </EuiFormRow>
          </div>
        );
      case '1':
        return (
          <div>
            <EuiFormRow
              label="Create index name or wildcard pattern"
              helpText="Create an SS4O compliant index or index pattern."
              isInvalid={!isCreateDatasourceValid}
              error={[]}
            >
              <EuiFieldText
                data-test-subj="create-indextemplate-name"
                name="first"
                onChange={(e) => onCreateDatasourceChange(e)}
                value={createDataSource}
                isInvalid={!isCreateDatasourceValid}
                append={
                  <EuiButton
                    data-test-subj="create-index-template-button"
                    onClick={() => {
                      createDataSourceMappings(createDataSource);
                    }}
                    disabled={createDataSource.length === 0}
                  >
                    Create
                  </EuiButton>
                }
              />
            </EuiFormRow>
            <EuiFormRow
              label="Index name or wildcard pattern"
              helpText="Input an index name or wildcard pattern that your integration will query."
              isInvalid={!isDataSourceValid}
              error={errors}
            >
              <EuiFieldText
                data-test-subj="datasource-name"
                name="first"
                onChange={(e) => onDatasourceChange(e)}
                value={dataSource}
                isInvalid={!isDataSourceValid}
                append={
                  <EuiButton
                    data-test-subj="resetCustomEmbeddablePanelTitle"
                    onClick={async () => {
                      const validationResult = await doExistingDataSourceValidation(dataSource);
                      setDataSourceValid(validationResult);
                    }}
                    disabled={dataSource.length === 0}
                  >
                    Validate
                  </EuiButton>
                }
              />
            </EuiFormRow>

            <EuiFormRow
              label="Name"
              helpText="This will be used to label the newly added integration."
            >
              <EuiFieldText
                data-test-subj="new-instance-name"
                name="first"
                onChange={(e) => onNameChange(e)}
                value={name}
              />
            </EuiFormRow>

            <EuiFormRow>
              <EuiCheckbox
                id={'test'}
                label="Add Sample Data"
                checked={checked}
                onChange={(e) => onCheckChange(e)}
              />
            </EuiFormRow>
            <EuiSpacer />
            {!checked ? (
              <EuiCallOut title="No sample data" iconType="documentation">
                <p>
                  Without sample data, you will need to manually create an index that maps to the
                  ss4o schema{' '}
                  <EuiLink href="https://opensearch.org/docs/latest/">Learn more</EuiLink>
                </p>
              </EuiCallOut>
            ) : null}
          </div>
        );
      default:
        return null;
    }
  };

  const radios = [
    {
      id: `0`,
      label: 'Yes, I do.',
    },
    {
      id: `1`,
      label: 'No, I do not.',
    },
  ];

  const [radioIdSelected, setRadioIdSelected] = useState(`0`);

  const onChange = (optionId: any) => {
    setRadioIdSelected(optionId);
  };

  const renderContent = () => {
    return (
      <>
        <EuiForm component="form">
          <EuiRadioGroup
            options={radios}
            idSelected={radioIdSelected}
            onChange={(id) => onChange(id)}
            data-test-subj="data-choice"
            name="radio group"
            legend={{
              children: <span> Do you have a SS4O compliant index name or wildcard pattern?</span>,
            }}
          />

          <EuiSpacer />

          {formContent()}
        </EuiForm>
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
              data-test-subj="createInstanceButton"
            >
              Add Integration
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
}
