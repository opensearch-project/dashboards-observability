/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiCallOut, EuiLink, EuiTitle } from '@elastic/eui';

export const DirectQueryVisualization = () => {
  return (
    <EuiFlexGroup direction="column">
      <EuiFlexItem grow={false}>
        <EuiCallOut title="Data source can't be visualized." color="danger" iconType="alert">
          <p>
            <EuiLink href="#">Index data to visualize</EuiLink>.
          </p>
        </EuiCallOut>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiTitle size="s">
          <h1>Index data to visualize or select indexed data.</h1>
        </EuiTitle>
        <p>
          For external data only materialized views or covering indexes can be visualized. Ask your
          administrator to create these indexes to visualize them.
        </p>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
