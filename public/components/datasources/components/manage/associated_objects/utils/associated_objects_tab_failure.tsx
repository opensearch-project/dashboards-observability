/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiEmptyPrompt } from '@elastic/eui';
import React from 'react';

export const AssociatedObjectsTabEmpty: React.FC = () => {
  return (
    <EuiEmptyPrompt
      iconType="alert"
      title={<h3>Error</h3>}
      body={<p>There was an error loading your databases.</p>}
    />
  );
};
