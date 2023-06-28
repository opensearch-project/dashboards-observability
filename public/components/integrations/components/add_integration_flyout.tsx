/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash';
import {
  EuiButton,
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

  const [createDatasourceOption, setCreateDatasourceOption] = useState<string>();

  const createDatasourceOptions = [
    {
      value: 'option_one',
      inputDisplay: 'Create Data Stream Automatically',
      dropdownDisplay: (
        <Fragment>
          <strong>Create Data Stream Automatically</strong>
          <EuiText size="s" color="subdued">
            <p className="ouiTextColor--subdued">
              Create an SS4O compliant index pattern or data stream
            </p>
          </EuiText>
        </Fragment>
      ),
    },
    {
      value: 'option_two',
      inputDisplay: "I'll Do It Myself",
      dropdownDisplay: (
        <Fragment>
          <strong>{"I'll Do it Myself"}</strong>
          <EuiText size="s" color="subdued">
            <p className="ouiTextColor--subdued">
              Create a SS4O compliant data stream first, then come back and create an integration
              from it.
            </p>
          </EuiText>
        </Fragment>
      ),
    },
  ];

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

  const onCreateSelectChange = (value: any) => {
    setCreateDatasourceOption(value);
  };

  const [namespace, setNamespace] = useState(''); // sets input value

  const onNamespaceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNamespace(e.target.value);
  };
  const [tags, setTags] = useState(''); // sets input value

  const onTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTags(e.target.value);
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
              label="Data Stream"
              helpText="The index pattern or data stream the integration will read from."
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
            <EuiFormRow label="Name" helpText="The name identifies the integration as a whole.">
              <EuiFieldText
                data-test-subj="instance-name"
                name="first"
                onChange={(e) => onNameChange(e)}
                value={name}
              />
            </EuiFormRow>
            <EuiSpacer />
            <EuiFormRow label="Namespace" helpText="The enviornment for which to ingest data.">
              <EuiFieldText
                data-test-subj="instance-namespace"
                name="first"
                onChange={(e) => onNamespaceChange(e)}
                value={namespace}
              />
            </EuiFormRow>
            <EuiSpacer />
            <EuiSpacer />
          </div>
        );
      case '1':
        return (
          <div>
            <EuiFormRow label="Create Data Stream Options">
              <EuiSuperSelect
                options={createDatasourceOptions}
                valueOfSelected={createDatasourceOption}
                onChange={(value) => onCreateSelectChange(value)}
                itemLayoutAlign="top"
                hasDividers
              />
            </EuiFormRow>
            <EuiSpacer />
            <EuiFormRow
              label="Data Stream"
              helpText="Create an SS4O compliant data stream."
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

            <EuiFormRow>
              <EuiCheckbox
                id={'test'}
                label="Add Sample Data"
                checked={checked}
                onChange={(e) => onCheckChange(e)}
              />
            </EuiFormRow>
          </div>
        );
      default:
        return null;
    }
  };

  const radios = [
    {
      id: `0`,
      label: 'I Have Data',
    },
    {
      id: `1`,
      label: "I Don't Have Data",
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
              children: (
                <span>
                  {' '}
                  Add an integration based on a SS4O compliant existing index pattern or data stream
                  or create a SS4O compliant data stream for this integration to read from
                </span>
              ),
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
