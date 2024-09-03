/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton, EuiCallOut, EuiLink, EuiSpacer, EuiText } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { coreRefs } from '../../../framework/core_refs';
import { gettingStartedURL } from './card_configs';
import { ObservabilityDashboardManager } from './register_dashboards_controls';

interface Props {
  // showFlyout: () => void;
}

export function AddDashboardCallout() {
  // const showFlyout = ObservabilityDashboardManager.getShowFlyout();
  const [showFlyout, setShowFlyout] = useState(() => () => {});

  useEffect(() => {
    const subscription3 = ObservabilityDashboardManager.showFlyout$.subscribe(setShowFlyout);
    return () => {
      subscription3.unsubscribe();
    };
  }, []);
  return (
    <>
      <EuiCallOut color="primary" iconType="gear" title="Select your dashboard">
        <EuiText size="s">
          <p>
            Select a dashboard to be displayed on this Overview page, or complete the steps
            described in{' '}
            <EuiLink
              onClick={() => coreRefs.application?.navigateToApp(gettingStartedURL, { path: '#/' })}
            >
              Getting Started Guide
            </EuiLink>{' '}
            to re-populate the dashboard with your log data. This dashboard can later be changed in
            advanced settings.
          </p>
        </EuiText>
        <EuiSpacer />
        <EuiButton onClick={showFlyout}>Select</EuiButton>
      </EuiCallOut>
    </>
  );
}
