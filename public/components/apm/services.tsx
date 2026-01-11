/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiButtonEmpty,
} from '@elastic/eui';
import { ChromeBreadcrumb, CoreStart, NotificationsStart } from '../../../../../src/core/public';
import { AppPluginStartDependencies } from '../../types';
import { ApmSettingsModal } from './config/apm_settings_modal';
import { ApmEmptyState } from './common/apm_empty_state';
import { HeaderControlledComponentsWrapper } from '../../plugin_helpers/plugin_headerControl';
import { useApmConfig } from './config/apm_config_context';

export interface ApmServicesProps {
  chrome: any;
  parentBreadcrumb: ChromeBreadcrumb;
  notifications: NotificationsStart;
  CoreStartProp: CoreStart;
  DepsStart: AppPluginStartDependencies;
  [key: string]: any;
}

export const Services = (props: ApmServicesProps) => {
  const { chrome, notifications, CoreStartProp, DepsStart } = props;
  const { config, loading, refresh } = useApmConfig();

  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);

  // Set breadcrumbs
  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Services',
        href: '#/services',
      },
    ]);
  }, [chrome]);

  const handleModalClose = (saved?: boolean) => {
    setIsSettingsModalVisible(false);
    if (saved) {
      refresh();
    }
  };

  const handleGetStartedClick = () => {
    setIsSettingsModalVisible(true);
  };

  // APM Settings button for header area
  const settingsButton = (
    <EuiButtonEmpty iconType="gear" size="s" onClick={() => setIsSettingsModalVisible(true)}>
      APM Settings
    </EuiButtonEmpty>
  );

  // Show loading spinner while checking config
  if (loading) {
    return (
      <EuiPage>
        <EuiPageBody>
          <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '400px' }}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="xl" />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPageBody>
      </EuiPage>
    );
  }

  // Show empty state if no config exists
  if (!config) {
    return (
      <EuiPage>
        <EuiPageBody>
          <HeaderControlledComponentsWrapper components={[settingsButton]} />

          <ApmEmptyState onGetStartedClick={handleGetStartedClick} />

          {isSettingsModalVisible && (
            <ApmSettingsModal
              onClose={handleModalClose}
              notifications={notifications}
              CoreStartProp={CoreStartProp}
              DepsStart={DepsStart}
            />
          )}
        </EuiPageBody>
      </EuiPage>
    );
  }

  // Show normal content with APM Settings button when config exists
  return (
    <EuiPage>
      <EuiPageBody>
        <HeaderControlledComponentsWrapper components={[settingsButton]} />

        <EuiSpacer size="l" />
        <EuiText>
          <p>APM Services page content goes here.</p>
        </EuiText>

        {isSettingsModalVisible && (
          <ApmSettingsModal
            onClose={handleModalClose}
            notifications={notifications}
            CoreStartProp={CoreStartProp}
            DepsStart={DepsStart}
          />
        )}
      </EuiPageBody>
    </EuiPage>
  );
};
