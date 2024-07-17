/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPageHeader, EuiPageHeaderSection, EuiTitle } from '@elastic/eui';
import React from 'react';

export const GettingStartedConnectionsHeader = () => {
  return (
    <div>
      <EuiPageHeader>
        <EuiPageHeaderSection>
          <EuiTitle size="l" data-test-subj="gettingstarted-header">
            <h1>Getting Started</h1>
          </EuiTitle>
        </EuiPageHeaderSection>
      </EuiPageHeader>
    </div>
  );
};
