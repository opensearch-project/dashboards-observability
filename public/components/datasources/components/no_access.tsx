/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSmallButton, EuiEmptyPrompt, EuiPage, EuiText } from '@elastic/eui';
import React from 'react';

export const NoAccess = () => {
  return (
    <EuiPage>
      <EuiEmptyPrompt
        iconType="alert"
        title={<h2>{'No permissions to access'}</h2>}
        body={
          <EuiText>
            {
              'You are missing permissions to view connection details. Contact your administrator for permissions.'
            }
          </EuiText>
        }
        actions={
          <EuiSmallButton color="primary" fill onClick={() => (window.location.hash = '')}>
            Return to data connections
          </EuiSmallButton>
        }
      />
    </EuiPage>
  );
};
