/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../common/constants/integrations';

export function DatasourcesHeader() {
  return (
    <div>
      <EuiPageHeader>
        <EuiPageHeaderSection>
          <EuiTitle size="l" data-test-subj="integrations-header">
            <h1>Data connections</h1>
          </EuiTitle>
        </EuiPageHeaderSection>
      </EuiPageHeader>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        Connect and manage compatible OpenSearch Dashboard data sources and compute.{' '}
        <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
          Learn more
        </EuiLink>
      </EuiText>
      <EuiSpacer size="l" />
    </div>
  );
}
