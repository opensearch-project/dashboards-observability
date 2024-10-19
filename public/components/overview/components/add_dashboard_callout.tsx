/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiCard,
  EuiImage,
  EuiPanel,
  EuiSpacer,
  EuiIcon,
  EuiTitle,
  EuiSmallButton,
} from '@elastic/eui';
import { useObservable } from 'react-use';
import { coreRefs } from '../../../framework/core_refs';
import { ObsDashboardStateManager } from './obs_dashboard_state_manager';
import { tutorialSampleDataPluginId } from '../../../../common/constants/shared';
import { uiSettingsService } from '../../../../common/utils';
import SelectDashboardSVG from './assets/SelectDashboard.svg';
import SampleDataDarkPNG from './assets/SampleDataDark.png';
import SampleDataLightPNG from './assets/SampleDataLight.png';

export function AddDashboardCallout() {
  const showFlyout = useObservable(ObsDashboardStateManager.showFlyout$);
  const isDarkMode = uiSettingsService.get('theme:darkMode');

  return (
    <EuiPanel paddingSize="m" hasShadow={true}>
      <EuiFlexGroup justifyContent="center" alignItems="center" direction="column" gutterSize="m">
        <EuiFlexItem grow={false}>
          <EuiIcon size="xxl" type="gear" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h3>Customize this page</h3>
          </EuiTitle>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiFlexGroup gutterSize="m" alignItems="stretch" justifyContent="center" wrap>
        <EuiFlexItem grow={false} style={{ maxWidth: 300 }}>
          <EuiCard
            image={
              <EuiImage
                src={SelectDashboardSVG}
                alt="Add a dashboard image"
                size="m"
                style={{ objectFit: 'cover', width: '100%', height: '150px' }}
              />
            }
            title="Add a dashboard"
            description="Customize the overview page by adding a dashboard."
            footer={
              <EuiFlexGroup justifyContent="flexEnd" gutterSize="none">
                <EuiSmallButton fill color="primary" onClick={showFlyout}>
                  Select a dashboard
                </EuiSmallButton>
              </EuiFlexGroup>
            }
          />
        </EuiFlexItem>

        <EuiFlexItem grow={false} style={{ maxWidth: 300 }}>
          <EuiCard
            image={
              <EuiImage
                src={isDarkMode ? SampleDataDarkPNG : SampleDataLightPNG}
                alt="Install sample Observability data image"
                size="m"
                style={{ objectFit: 'cover', width: '100%' }}
              />
            }
            title="Install sample Observability data"
            description="Log, Traces, and Metrics for an e-commerce application in OpenTelemetry standard."
            footer={
              <EuiFlexGroup justifyContent="flexEnd" gutterSize="none">
                <EuiSmallButton
                  onClick={() =>
                    coreRefs.application?.navigateToApp(tutorialSampleDataPluginId, { path: '#/' })
                  }
                >
                  Add sample data
                </EuiSmallButton>
              </EuiFlexGroup>
            }
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}
