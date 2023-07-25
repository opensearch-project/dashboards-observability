/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCallOut, EuiLink } from '@elastic/eui';
import React, { useEffect, useState } from 'react';

export function AccelerateCallout() {
  return (
    <EuiCallOut title="Considerations for data acceleration" iconType="help">
      <p>
        Warning about not indexing personal or sensitive data, something about the cost of indexing.
      </p>
    </EuiCallOut>
  );
}
