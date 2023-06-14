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

interface IntegrationFlyoutProps {
  onClose: () => void;
  onCreate: (name: string, dataSource: string) => void;
  integrationName: string;
}

export function AddIntegrationFlyout(props: IntegrationFlyoutProps) {
  const { onClose, onCreate, integrationName } = props;

  const [checked, setChecked] = useState(false);

  const [isDataSourceValid, setDataSourceValid] = useState(true);

  const [isCreateDatasourceValid, setCreateDataSourceValid] = useState(true);

  const [name, setName] = useState(integrationName || ''); // sets input value
  const [dataSource, setDataSource] = useState('');

  const [createDataSource, setCreateDataSource] = useState('');

  const onDatasourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDataSource(e.target.value);
  };

  const onCheckChange = (e) => {
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
      inputDisplay: 'Create Data Source Automatically',
      dropdownDisplay: (
        <Fragment>
          <strong>Create Data Source Automatically</strong>
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
              Create a SS4O compliant data source first, then come back and create an integration
              from it.
            </p>
          </EuiText>
        </Fragment>
      ),
    },
  ];

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

  const formContent = () => {
    switch (radioIdSelected) {
      case '0':
        return (
          <div>
            <EuiFormRow
              label="Data Source"
              helpText="The index pattern or data stream the integration will read from."
              isInvalid={!isDataSourceValid}
              error={errors}
            >
              <EuiFieldText
                data-test-subj="instance-name"
                name="first"
                onChange={(e) => onDatasourceChange(e)}
                value={dataSource}
                isInvalid={!isDataSourceValid}
                append={
                  <EuiButton
                    data-test-subj="resetCustomEmbeddablePanelTitle"
                    onClick={() => {
                      if (dataSource.length) {
                        if (dataSource === 'ss4o') {
                          setDataSourceValid(true);
                        } else if (dataSource === 'test') {
                          setDataSourceValid(false);
                          setErrors([
                            "This index matches the schema, but doesn't follow ss4o naming conventions",
                          ]);
                        } else {
                          setDataSourceValid(false);
                          setErrors(["This index doesn't match the schema"]);
                        }
                      }
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
            <EuiFormRow
              label="Tags (optional)"
              helpText="Tags you want associated with this integration."
            >
              <EuiFieldText
                data-test-subj="instance-tags"
                name="first"
                onChange={(e) => onTagsChange(e)}
                value={tags}
              />
            </EuiFormRow>
            <EuiSpacer />
          </div>
        );
      case '1':
        return (
          <div>
            <EuiFormRow label="Create Data Source Options">
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
              label="Data Source"
              helpText="Create an SS4O compliant data source."
              isInvalid={!isCreateDatasourceValid}
              error={[]}
            >
              <EuiFieldText
                data-test-subj="instance-name"
                name="first"
                onChange={(e) => onCreateDatasourceChange(e)}
                value={createDataSource}
                isInvalid={!isCreateDatasourceValid}
                append={
                  <EuiButton
                    data-test-subj="resetCustomEmbeddablePanelTitle"
                    onClick={() => {}}
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

  const onChange = (optionId) => {
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
            name="radio group"
            legend={{
              children: (
                <span>
                  {' '}
                  Add an integration based on a SS4O compliant existing index pattern or data stream
                  or create a SS4O compliant data source for this integration to read from
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
