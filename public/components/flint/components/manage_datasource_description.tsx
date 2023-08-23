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

export function DatasourcesDescription() {
  return (
    <div>
      <EuiTitle size="s">
        <h2>Manage existing data connections</h2>
      </EuiTitle>

      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        Create or manage already created data source connections.
      </EuiText>
      <EuiHorizontalRule size="full" />
    </div>
  );
}
