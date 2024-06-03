/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiCallOut, EuiButtonEmpty, EuiLink, EuiSpacer } from '@elastic/eui';

interface AccelerateCalloutProps {
  onCreateAcceleration: () => void;
}

export const AccelerateCallout = ({ onCreateAcceleration }: AccelerateCalloutProps) => (
  <>
    <EuiSpacer size="s" />
    <EuiCallOut
      iconType={'iInCircle'}
      size="s"
      title={
        <>
          <span>
            Security Lake tables include acceleration with skipping index, but the query performance
            can be further improved with other types of accelerations.
          </span>
          <EuiButtonEmpty onClick={onCreateAcceleration}>Create acceleration</EuiButtonEmpty>
          <span>&nbsp;or&nbsp;</span>
          <EuiLink
            href="https://opensearch.org/docs/latest/dashboards/management/accelerate-external-data/"
            target="_blank"
          >
            Learn more
          </EuiLink>
        </>
      }
    />
    <EuiSpacer size="s" />
  </>
);
