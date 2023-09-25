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
  EuiButton,
} from '@elastic/eui';
import React, { useState } from 'react';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../../common/constants/data_connections';
import { QueryPermissionsConfiguration } from '../manage/query_permissions';

interface ConfigureS3DatasourceProps {
  roles: Array<{ label: string }>;
  selectedQueryPermissionRoles: Array<{ label: string }>;
  setSelectedQueryPermissionRoles: React.Dispatch<React.SetStateAction<Array<{ label: string }>>>;
  currentName: string;
  currentDetails: string;
  currentArn: string;
  currentStore: string;
  setStoreForRequest: React.Dispatch<React.SetStateAction<string>>;
  setNameForRequest: React.Dispatch<React.SetStateAction<string>>;
  setDetailsForRequest: React.Dispatch<React.SetStateAction<string>>;
  setArnForRequest: React.Dispatch<React.SetStateAction<string>>;
}

export const ConfigureS3Datasource = (props: ConfigureS3DatasourceProps) => {
  const {
    setNameForRequest,
    setDetailsForRequest,
    setArnForRequest,
    setStoreForRequest,
    currentStore,
    currentName,
    currentDetails,
    currentArn,
    roles,
    selectedQueryPermissionRoles,
    setSelectedQueryPermissionRoles,
  } = props;

  const [name, setName] = useState(currentName);
  const [details, setDetails] = useState(currentDetails);
  const [arn, setArn] = useState(currentArn);
  const [store, setStore] = useState(currentStore);

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
        <EuiSpacer />

        <EuiFormRow label="Authentication Method">
          <>
            <EuiText size="xs">
              <p>
                This parameters provides the authentication type information required for execution
                engine to connect to glue.
              </p>
            </EuiText>
            <EuiFieldText data-test-subj="authentication-method" value="IAM role" readOnly />
          </>
        </EuiFormRow>

        <EuiFormRow label="Glue authenticaiton ARN">
          <>
            <EuiText size="xs">
              <p>This should be the IAM role ARN</p>
            </EuiText>
            <EuiFieldText
              data-test-subj="role-ARN"
              placeholder="Role ARN"
              value={arn}
              onChange={(e) => {
                setArn(e.target.value);
              }}
              onBlur={(e) => {
                setArnForRequest(e.target.value);
              }}
            />
          </>
        </EuiFormRow>

        <EuiSpacer />

        <EuiText>
          <h3>Glue index store details</h3>
        </EuiText>
        <EuiSpacer />

        <EuiFormRow label="Glue index store URI">
          <>
            <EuiText size="xs">
              <p>
                This parameters provides the OpenSearch cluster host information for glue. This
                OpenSearch instance is used for writing index data back.
              </p>
            </EuiText>
            <EuiFieldText
              data-test-subj="index-URI"
              placeholder="Index store URI"
              value={store}
              onChange={(e) => {
                setStore(e.target.value);
              }}
              onBlur={(e) => {
                setStoreForRequest(e.target.value);
              }}
            />
          </>
        </EuiFormRow>

        <EuiFormRow label="Glue index store authentication">
          <>
            <EuiText size="xs">
              <p>Lorem ipsum.</p>
            </EuiText>
            <EuiFieldText data-test-subj="index-auth" value="False" readOnly />
          </>
        </EuiFormRow>

        <EuiFormRow label="Glue index store region">
          <>
            <EuiText size="xs">
              <p>Lorem ipsum.</p>
            </EuiText>
            <EuiFieldText data-test-subj="index-location" value="us-west-2" readOnly />
          </>
        </EuiFormRow>

        <EuiButton>Test connection</EuiButton>

        <EuiSpacer />

        <QueryPermissionsConfiguration
          roles={roles}
          selectedRoles={selectedQueryPermissionRoles}
          setSelectedRoles={setSelectedQueryPermissionRoles}
        />
      </EuiPanel>
    </div>
  );
};
