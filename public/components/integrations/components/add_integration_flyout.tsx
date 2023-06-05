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
  EuiFormRow,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';
import React, { useState } from 'react';

interface IntegrationFlyoutProps {
  onClose: () => void;
  onCreate: (name: string, namespace: string, tags: string) => void;
  integrationName: string;
}

export function AddIntegrationFlyout(props: IntegrationFlyoutProps) {
  const { onClose, onCreate, integrationName } = props;

  const [name, setName] = useState(integrationName || ''); // sets input value

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const [namespace, setNamespace] = useState(''); // sets input value

  const onNamespaceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNamespace(e.target.value);
  };
  const [tags, setTags] = useState(''); // sets input value

  const onTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTags(e.target.value);
  };

  const renderContent = () => {
    return (
      <>
        <EuiForm component="form">
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
                onCreate(name, namespace, tags);
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
