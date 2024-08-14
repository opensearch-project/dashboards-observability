/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton, EuiCallOut, EuiLink, EuiSpacer, EuiText } from '@elastic/eui';
import React from 'react';
import { gettingStartedURL } from './card_configs';

interface Props {
  showFlyout: () => void;
  navigateToApp: (appId: string, path: string) => void;
}

export function AddDashboardCallout({ showFlyout, navigateToApp }: Props) {
  return (
    <>
      <EuiCallOut color="primary" iconType="gear" title="Select your dashboard">
        <EuiText size="s">
          <p>
            Select a dashboard to be displayed on this Overview page, or complete the steps
            described in{' '}
            <EuiLink onClick={() => navigateToApp(gettingStartedURL, '#/')}>
              Getting Started Guide
            </EuiLink>{' '}
            to re-populate the dashboard with your log data. This dashboard can later be changed in
            advanced settings.
          </p>
        </EuiText>
        <EuiSpacer />
        <EuiButton onClick={showFlyout}>Add</EuiButton>
      </EuiCallOut>
    </>
  );
}
