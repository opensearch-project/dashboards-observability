/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiTitle } from '@elastic/eui';
import React from 'react';

interface GettingStartedDescriptionProps {
  title: string;
}

export const GettingStartedDescription = ({ title }: GettingStartedDescriptionProps) => {
  return (
    <div>
      <EuiTitle size="s">
        <h2>{title}</h2>
      </EuiTitle>
    </div>
  );
};
