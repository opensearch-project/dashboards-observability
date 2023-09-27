/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSpacer, EuiText, EuiTitle, EuiHorizontalRule } from '@elastic/eui';
import React from 'react';

export const DataConnectionsDescription = () => {
  return (
    <div>
      <EuiTitle size="s">
        <h2>Manage existing data sources</h2>
      </EuiTitle>

      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        Manage already created data sources.
      </EuiText>
      <EuiHorizontalRule size="full" />
    </div>
  );
};
