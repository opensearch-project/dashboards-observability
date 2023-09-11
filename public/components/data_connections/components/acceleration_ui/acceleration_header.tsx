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
import React from 'react';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../../common/constants/integrations';

export const AccelerationHeader = () => {
  return (
    <div>
      <EuiPageHeader>
        <EuiPageHeaderSection>
          <EuiTitle size="l" data-test-subj="acceleration-header">
            <h1>Acceleration Indices</h1>
          </EuiTitle>
        </EuiPageHeaderSection>
      </EuiPageHeader>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        Manage acceleration indices from external data connections.{' '}
        <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
          Learn more
        </EuiLink>
      </EuiText>
      <EuiSpacer size="l" />
    </div>
  );
};
