/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton, EuiEmptyPrompt, EuiPage, EuiPanel, EuiText } from '@elastic/eui';
import _ from 'lodash';
import React from 'react';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../common/constants/data_connections';

export const NoAccess = () => {
  return (
    <EuiPage>
      <EuiPanel>
        <EuiEmptyPrompt
          title={<h2>{"You don't have permissions to access the requested page"}</h2>}
          body={
            <EuiText>
              {
                'You do not have the permissions to view and edit data connections. Please reach out to your administrator for access.'
              }
            </EuiText>
          }
          actions={
            <EuiButton
              color="primary"
              iconSide="right"
              iconType="popout"
              onClick={() => window.open(OPENSEARCH_DOCUMENTATION_URL, '_blank')}
            >
              Learn more
            </EuiButton>
          }
        />
      </EuiPanel>
    </EuiPage>
  );
};
