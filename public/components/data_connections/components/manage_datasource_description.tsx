/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSpacer, EuiText, EuiTitle, EuiHorizontalRule } from '@elastic/eui';
import _ from 'lodash';
import React from 'react';

export function DataConnectionsDescription() {
  return (
    <div>
      <EuiTitle size="s">
        <h2>Manage existing data connections</h2>
      </EuiTitle>

      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        Manage already created data source connections.
      </EuiText>
      <EuiHorizontalRule size="full" />
    </div>
  );
}
