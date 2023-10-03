/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiProgress, EuiEmptyPrompt } from '@elastic/eui';

export const DirectQueryRunning = () => {
  return (
    <EuiEmptyPrompt
      icon={<EuiProgress size="xs" color="accent" />}
      title={<h2>Query Processing</h2>}
    />
  );
};
