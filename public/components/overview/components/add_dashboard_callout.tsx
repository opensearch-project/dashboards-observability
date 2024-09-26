/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSmallButton, EuiCallOut, EuiLink, EuiSpacer, EuiText } from '@elastic/eui';
import React from 'react';
import { useObservable } from 'react-use';
import { coreRefs } from '../../../framework/core_refs';
import { ObsDashboardStateManager } from './obs_dashboard_state_manager';
import { observabilityGettingStartedID } from '../../../../common/constants/shared';

export function AddDashboardCallout() {
  const showFlyout = useObservable(ObsDashboardStateManager.showFlyout$);

  return (
    <>
      <EuiCallOut color="primary" iconType="gear" title="Select your dashboard">
        <EuiText size="s">
          <p>
            Select a dashboard to be displayed on this Overview page, or complete the steps
            described in{' '}
            <EuiLink
              onClick={() => coreRefs.application?.navigateToApp(observabilityGettingStartedID)}
            >
              Getting Started Guide
            </EuiLink>{' '}
            to re-populate the dashboard with your log data. This dashboard can later be changed in
            advanced settings.
          </p>
        </EuiText>
        <EuiSpacer />
        <EuiSmallButton onClick={showFlyout}>Select</EuiSmallButton>
      </EuiCallOut>
    </>
  );
}
