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
    // Read current value from uiSettingsClient
    const loadSetting = async () => {
      if (coreRefs.core?.uiSettings) {
        const apmEnabled = coreRefs.core.uiSettings.get<boolean>('observability:apmEnabled', false);
        setIsEnabled(apmEnabled);
      }
    };

    loadSetting();

    // Subscribe to changes
    const subscription = coreRefs.core?.uiSettings
      .get$('observability:apmEnabled')
      .subscribe((value) => {
        setIsEnabled(value === true);
      });

    return () => subscription?.unsubscribe();
  }, []);

  const handleToggle = async (checked: boolean) => {
    setIsLoading(true);
    try {
      if (coreRefs.core?.uiSettings) {
        // Update the setting using uiSettingsClient
        await coreRefs.core.uiSettings.set('observability:apmEnabled', checked);

        coreRefs.toasts?.addSuccess(
          `APM integration ${checked ? 'enabled' : 'disabled'}. Redirecting...`
        );

        // Navigate to the appropriate services page - apps are always registered but hidden
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
