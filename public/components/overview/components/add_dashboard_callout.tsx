/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton, EuiCallOut, EuiSpacer, EuiText } from '@elastic/eui';
import React from 'react';

interface Props {
  showModal: () => void;
}

export function AddDashboardCallout({ showModal }: Props) {
  return (
    <>
      <EuiCallOut color="primary" iconType="gear" title="Select your dashboard">
        <EuiText size="s">
          <p>
            Select a dashboard to be displayed on this Overview page. This dashboard can later be
            changed in advanced settings.
          </p>
        </EuiText>
        <EuiSpacer />
        <EuiButton onClick={showModal}>Add</EuiButton>
      </EuiCallOut>
    </>
  );
}
