/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiButtonEmpty,
} from '@elastic/eui';
import { ChromeBreadcrumb, NotificationsStart } from '../../../../../src/core/public';
import { ApmSettingsModal } from './config/apm_settings_modal';
import { ApmEmptyState } from './common/apm_empty_state';
import { HeaderControlledComponentsWrapper } from '../../plugin_helpers/plugin_headerControl';
import { useApmConfig } from './config/apm_config_context';
import { ServicesHome } from './pages/services_home';

export interface ApmServicesProps {
  chrome: any;
  parentBreadcrumb: ChromeBreadcrumb;
  notifications: NotificationsStart;
  [key: string]: any;
}

export const Services = (props: ApmServicesProps) => {
  const { chrome, notifications } = props;
  const { config, loading, error, refresh } = useApmConfig();

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

  // Show toast when config fetch error occurs
  useEffect(() => {
    if (error) {
      notifications.toasts.addDanger({
        title: 'Failed to load APM configuration',
        text: error.message || 'An error occurred while loading the configuration.',
      });
    }
  }, [error, notifications]);

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
            <ApmSettingsModal onClose={handleModalClose} notifications={notifications} />
          )}
        </EuiPageBody>
      </EuiPage>
    );
  }

  // Show normal content with APM Settings button when config exists
  return (
    <>
      <HeaderControlledComponentsWrapper components={[settingsButton]} />

      <ServicesHome
        chrome={chrome}
        parentBreadcrumb={props.parentBreadcrumb}
        onServiceClick={(serviceName, environment) => {
          // Navigate to service details page
          window.location.href = `#/service-details/${encodeURIComponent(
            serviceName
          )}/${encodeURIComponent(environment)}`;
        }}
      />

      {isSettingsModalVisible && (
        <ApmSettingsModal onClose={handleModalClose} notifications={notifications} />
      )}
    </>
  );
};
