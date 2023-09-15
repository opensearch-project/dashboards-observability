/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import _ from 'lodash';
import React from 'react';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../common/constants/data_connections';

export const DataConnectionsHeader = () => {
  return (
    <div>
      <EuiPageHeader>
        <EuiPageHeaderSection>
          <EuiTitle size="l" data-test-subj="dataconnections-header">
            <h1>Data connections</h1>
          </EuiTitle>
        </EuiPageHeaderSection>
      </EuiPageHeader>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        Connect and manage compatible OpenSearch and OpenSearch Dashboard data connections.{' '}
        <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
          Learn more
        </EuiLink>
      </EuiText>
      <EuiSpacer size="l" />
    </div>
  );
};
