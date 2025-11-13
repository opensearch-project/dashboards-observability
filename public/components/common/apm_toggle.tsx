/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { EuiSwitch, EuiSpacer, EuiToolTip } from '@elastic/eui';
import { observabilityApmServicesID } from '../../../common/constants/shared';
import { coreRefs } from '../../framework/core_refs';

export const ApmToggle = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Read current value from workspace uiSettings
    const subscription = coreRefs.workspaces?.currentWorkspace$.subscribe((workspace) => {
      const apmEnabled = workspace?.uiSettings?.['observability:apmEnabled'];
      setIsEnabled(apmEnabled === true);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const handleToggle = async (checked: boolean) => {
    setIsLoading(true);
    try {
      const workspace = coreRefs.workspaces?.currentWorkspace$.getValue();
      if (workspace?.id && coreRefs.core?.uiSettings) {
        coreRefs.toasts?.addSuccess(
          `APM integration ${checked ? 'enabled' : 'disabled'}. Redirecting...`
        );

        // Navigate to the appropriate services page - apps are always registered but hidden
        // This avoids a race condition where the page is disabled and shows an error before redirect happens
        const targetAppId = checked ? observabilityApmServicesID : 'observability-services-nav';
        coreRefs.application?.navigateToApp(targetAppId).then(() => {
          // Reload after navigation to update the navigation sidebar
          window.location.reload();
        });
      }
    } catch (error) {
      console.error('Error:', error);
      coreRefs.toasts?.addDanger('Failed to update APM setting');
      setIsLoading(false);
    }
  };

  return (
    <>
      <EuiToolTip content="Toggle between Investigate Services view and Application Monitoring Services view">
        <EuiSwitch
          label="Enable Application Monitoring"
          checked={isEnabled}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={isLoading}
        />
      </EuiToolTip>
      <EuiSpacer size="m" />
    </>
  );
};
