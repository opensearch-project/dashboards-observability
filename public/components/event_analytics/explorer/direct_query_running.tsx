/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiButton,
  EuiTitle,
  EuiCallOut,
  EuiLink,
  EuiProgress,
  EuiSpacer,
} from '@elastic/eui';

export const DirectQueryRunning = () => {
  return (
    <EuiCallOut title="Query Processing..." color="warning" iconType="help">
      <EuiProgress size="xs" color="accent" />
      <EuiSpacer size="s" />
      <p>
        Leaving the page will cancel the query. Query performance can be improved.
        <EuiLink href="https://opensearch.org/docs/latest/">Learn more</EuiLink>.
      </p>
      <EuiButton href="#" color="warning">
        Cancel
      </EuiButton>
    </EuiCallOut>
    // <EuiFlexGroup direction="column" justifyContent="flexStart">
    //   <EuiFlexItem grow={false}>
    //     <EuiFlexGroup direction="row" justifyContent="spaceAround">
    //       <EuiFlexItem grow={false}>
    //         <EuiLoadingSpinner size="l" />
    //       </EuiFlexItem>
    //     </EuiFlexGroup>
    //   </EuiFlexItem>
    //   <EuiFlexItem grow={false}>
    //     <EuiFlexGroup direction="row" justifyContent="spaceAround">
    //       <EuiFlexItem grow={false}>
    //         <EuiTitle>
    //           <h3>Query Processing...</h3>
    //         </EuiTitle>
    //       </EuiFlexItem>
    //     </EuiFlexGroup>
    //   </EuiFlexItem>
    //   <EuiFlexItem grow={false}>
    //     <EuiFlexGroup direction="row" justifyContent="spaceAround">
    //       <EuiFlexItem grow={false}>
    //         <EuiButton color="success" onClick={() => {}}>
    //           Cancel
    //         </EuiButton>
    //       </EuiFlexItem>
    //     </EuiFlexGroup>
    //   </EuiFlexItem>
    // </EuiFlexGroup>
  );
};
