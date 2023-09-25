/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiPanel,
  EuiTitle,
  EuiSpacer,
  EuiText,
  EuiLink,
  EuiFormRow,
  EuiFieldText,
  EuiTextArea,
} from '@elastic/eui';
import React, { useState } from 'react';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../../common/constants/data_connections';

interface ConfigureS3DatasourceProps {
  currentName: string;
  currentDetails: string;
  setNameForRequest: React.Dispatch<React.SetStateAction<string>>;
  setDetailsForRequest: React.Dispatch<React.SetStateAction<string>>;
}

export const ConfigureS3Datasource = (props: ConfigureS3DatasourceProps) => {
  const { setNameForRequest, setDetailsForRequest, currentName, currentDetails } = props;

  const [name, setName] = useState(currentName);
  const [details, setDetails] = useState(currentDetails);

  return (
    <div>
      <EuiPanel>
        <EuiTitle>
          <h1>{`Configure S3 Data Source`}</h1>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          {`Connect to S3with OpenSearch and OpenSearch Dashboards `}
          <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
            Learn more
          </EuiLink>
        </EuiText>
        <EuiSpacer />
        <EuiText>
          <h3>Data source details</h3>
        </EuiText>
        <EuiSpacer />
        <EuiFormRow label="Data source name">
          <>
            <EuiText size="xs">
              <p>
                This is the name the connection will be referenced by in OpenSearch Dashboards. It
                is recommended to make this short yet descriptive to help users when selecting a
                connection.
              </p>
            </EuiText>
            <EuiFieldText
              data-test-subj="data-source-name"
              placeholder="Title"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              onBlur={(e) => {
                setNameForRequest(e.target.value);
              }}
            />
          </>
        </EuiFormRow>
        <EuiFormRow label="Description - Optional">
          <EuiTextArea
            placeholder="Placeholder"
            value={details}
            onBlur={(e) => {
              setDetailsForRequest(e.target.value);
            }}
            onChange={(e) => {
              setDetails(e.target.value);
            }}
          />
        </EuiFormRow>
        <EuiSpacer />

        <EuiText>
          <h3>Glue authentication details</h3>
        </EuiText>
      </EuiPanel>
    </div>
  );
};
