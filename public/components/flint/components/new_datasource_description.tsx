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
  EuiHorizontalRule,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';

export function NewDatasourcesDescription() {
  return (
    <div>
      <EuiTitle size="s">
        <h2>Create a new data connection</h2>
      </EuiTitle>

      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        Connect to a compatible data source or compute engine to bring your data into OpenSearch and
        OpenSearch Dashboards.
      </EuiText>
      <EuiHorizontalRule size="full" />
    </div>
  );
}
