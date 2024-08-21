/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash';
import {
  EuiSmallButton,
  EuiCompressedFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiText,
  EuiLink,
  EuiCompressedFormRow,
  EuiTitle,
} from '@elastic/eui';
import React, { useState } from 'react';
import { HttpStart } from '../../../../../../src/core/public';
import { useToast } from '../../../../public/components/common/toast';
import { doExistingDataSourceValidation } from './create_integration_helpers';

interface IntegrationFlyoutProps {
  onClose: () => void;
  onCreate: (name: string, dataSource: string) => void;
  integrationName: string;
  integrationType: string;
  http: HttpStart;
}

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
        <EuiCompressedFormRow
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
          <EuiCompressedFieldText
            data-test-subj="data-source-name"
            name="first"
            onChange={(e) => onDatasourceChange(e)}
            value={dataSource}
            isInvalid={isDataSourceValid === false}
            append={
              <EuiSmallButton
                data-test-subj="validateIndex"
                onClick={async () => {
                  const validationResult = await doExistingDataSourceValidation(
                    dataSource,
                    integrationName,
                    integrationType
                  );
                  if (validationResult.ok) {
                    setToast('Index name or wildcard pattern is valid', 'success');
                  }
                  setDataSourceValid(validationResult.ok);
                  setErrors(!validationResult.ok ? validationResult.errors : []);
                }}
                disabled={dataSource.length === 0}
              >
                Validate
              </EuiSmallButton>
            }
          />
        </EuiCompressedFormRow>
        <EuiCompressedFormRow label="Name" helpText="This will be used to label the newly added integration.">
          <EuiCompressedFieldText
            data-test-subj="new-instance-name"
            name="first"
            onChange={(e) => onNameChange(e)}
            value={name}
          />
        </EuiCompressedFormRow>
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
            <EuiSmallButton onClick={() => onClose()} color="danger">
              Cancel
            </EuiSmallButton>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiSmallButton
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
            </EuiSmallButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
}
