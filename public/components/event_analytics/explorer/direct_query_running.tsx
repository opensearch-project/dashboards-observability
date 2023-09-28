/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiButton, EuiCallOut, EuiLink, EuiProgress, EuiSpacer } from '@elastic/eui';

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
  );
};
