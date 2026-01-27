/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiText,
} from '@elastic/eui';
import { HashRouter, Route, Switch, Redirect } from 'react-router-dom';
import { ChromeBreadcrumb, NotificationsStart } from '../../../../../src/core/public';
import { ApmSettingsModal } from './config/apm_settings_modal';
import { ApmEmptyState } from './common/apm_empty_state';
import { HeaderControlledComponentsWrapper } from '../../plugin_helpers/plugin_headerControl';
import { useApmConfig } from './config/apm_config_context';
import { ServicesHome } from './pages/services_home';
import { ServiceDetails } from './pages/service_details';
import { navigateToServiceDetails } from './shared/utils/navigation_utils';
import { TimeRangePicker } from './shared/components/time_filter';
import { LanguageIcon } from './shared/components/language_icon';
import { LegacyBanner } from './shared/components/legacy_banner';
import { TimeRange } from './common/types/service_types';
import './shared/styles/apm_common.scss';

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

  // Service details page state - lifted from ServiceDetails for header rendering
  const [isServiceDetailsRoute, setIsServiceDetailsRoute] = useState(false);
  const [serviceDetailsTimeRange, setServiceDetailsTimeRange] = useState<TimeRange>({
    from: 'now-15m',
    to: 'now',
  });
  const [serviceDetailsRefreshTrigger, setServiceDetailsRefreshTrigger] = useState(0);
  const [currentServiceLanguage, setCurrentServiceLanguage] = useState<string | undefined>();

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

  const handleServiceDetailsRefresh = useCallback(() => {
    setServiceDetailsRefreshTrigger((prev) => prev + 1);
  }, []);

  // APM Settings button for header area - text version for services home
  const settingsButton = (
    <EuiButtonEmpty iconType="gear" size="l" onClick={() => setIsSettingsModalVisible(true)}>
      APM Settings
    </EuiButtonEmpty>
  );

  // Service details header components - time picker + icon-only settings button
  const serviceDetailsHeaderComponents = useMemo(
    () => [
      <TimeRangePicker
        key="time-picker"
        timeRange={serviceDetailsTimeRange}
        onChange={setServiceDetailsTimeRange}
        onRefresh={handleServiceDetailsRefresh}
        compressed
      />,
      <EuiButtonIcon
        key="settings"
        iconType="gear"
        display="base"
        size="s"
        iconSize="m"
        aria-label="APM Settings"
        onClick={() => setIsSettingsModalVisible(true)}
      />,
    ],
    [serviceDetailsTimeRange, handleServiceDetailsRefresh]
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
    // Set breadcrumbs for empty state
    chrome.setBreadcrumbs([
      {
        text: 'Services',
        href: '#/services',
      },
    ]);

    return (
      <EuiPage>
        <EuiPageBody>
          <HeaderControlledComponentsWrapper
            components={[settingsButton]}
            bottomControls={<LegacyBanner />}
          />

          <ApmEmptyState onGetStartedClick={handleGetStartedClick} />

          {isSettingsModalVisible && (
            <ApmSettingsModal onClose={handleModalClose} notifications={notifications} />
          )}
        </EuiPageBody>
      </EuiPage>
    );
  }

  // Set breadcrumbs for services home
  const setServicesBreadcrumbs = () => {
    chrome.setBreadcrumbs([
      {
        text: 'Services',
        href: '#/services',
      },
    ]);
  };

  // Set breadcrumbs for service details with language icon (gear icon as fallback)
  const setServiceDetailsBreadcrumbs = (
    serviceName: string,
    environment?: string,
    language?: string
  ) => {
    chrome.setBreadcrumbs([
      {
        text: 'Services',
        href: '#/services',
      },
      {
        text: (
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <LanguageIcon language={language} size="l" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText>
                <h1>{decodeURIComponent(serviceName)}</h1>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        href: `#/service-details/${serviceName}/${environment || 'default'}`,
      },
    ]);
  };

  // Show normal content with APM Settings button when config exists
  return (
    <>
      <HeaderControlledComponentsWrapper
        components={isServiceDetailsRoute ? serviceDetailsHeaderComponents : [settingsButton]}
      />

      <HashRouter>
        <Switch>
          {/* Service Details Route */}
          <Route
            path="/service-details/:serviceName/:environment"
            render={(routeProps) => {
              const { serviceName, environment } = routeProps.match.params;
              const decodedServiceName = decodeURIComponent(serviceName);
              const decodedEnvironment = decodeURIComponent(environment);

              // Parse language from URL query params
              const hashQueryIndex = window.location.hash.indexOf('?');
              const hashParams =
                hashQueryIndex >= 0
                  ? new URLSearchParams(window.location.hash.substring(hashQueryIndex + 1))
                  : new URLSearchParams();
              const language = hashParams.get('lang') || undefined;

              // Set service details route state and breadcrumbs
              if (!isServiceDetailsRoute) {
                setIsServiceDetailsRoute(true);
              }
              if (language !== currentServiceLanguage) {
                setCurrentServiceLanguage(language);
              }
              setServiceDetailsBreadcrumbs(serviceName, environment, language);

              return (
                <ServiceDetails
                  serviceName={decodedServiceName}
                  environment={decodedEnvironment !== 'default' ? decodedEnvironment : undefined}
                  timeRange={serviceDetailsTimeRange}
                  onTimeChange={setServiceDetailsTimeRange}
                  onRefresh={handleServiceDetailsRefresh}
                  refreshTrigger={serviceDetailsRefreshTrigger}
                />
              );
            }}
          />

          {/* Services Home Route */}
          <Route
            path="/services"
            render={() => {
              // Reset service details route state
              if (isServiceDetailsRoute) {
                setIsServiceDetailsRoute(false);
              }

              // Set breadcrumbs for services home
              setServicesBreadcrumbs();

              return (
                <ServicesHome
                  chrome={chrome}
                  parentBreadcrumb={props.parentBreadcrumb}
                  onServiceClick={(serviceName, environment, language, timeRange) => {
                    // Sync parent's time state when navigating
                    if (timeRange) {
                      setServiceDetailsTimeRange(timeRange);
                    }
                    navigateToServiceDetails(serviceName, environment, { language, timeRange });
                  }}
                />
              );
            }}
          />

          {/* Default redirect to services */}
          <Redirect to="/services" />
        </Switch>
      </HashRouter>

      {isSettingsModalVisible && (
        <ApmSettingsModal onClose={handleModalClose} notifications={notifications} />
      )}
    </>
  );
};
