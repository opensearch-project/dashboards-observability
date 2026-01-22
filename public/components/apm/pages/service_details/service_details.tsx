/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  EuiTabbedContent,
  EuiTabbedContentTab,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiCallOut,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { useApmConfig } from '../../config/apm_config_context';
import { ServiceOverview } from './service_overview';
import { ServiceOperations } from './service_operations';
import { ServiceDependencies } from './service_dependencies';
import {
  TimeRange,
  ServiceDetailsTabId,
  ServiceDetailsUrlParams,
} from '../../common/types/service_details_types';
import { SERVICE_DETAILS_CONSTANTS } from '../../common/constants';

export interface ServiceDetailsProps {
  serviceName: string;
  environment?: string;
  initialTab?: ServiceDetailsTabId;
  // Props for header-controlled time range (passed from parent)
  timeRange: TimeRange;
  onTimeChange: (timeRange: TimeRange) => void;
  onRefresh: () => void;
  refreshTrigger: number;
}

/**
 * ServiceDetails - Main container page for service details
 *
 * Features:
 * - Tab navigation: Overview | Operations | Dependencies
 * - Time range picker controlled by parent (in header area)
 * - URL param support for: tab, timeRange, filters
 * - Back navigation to services list
 */
export const ServiceDetails: React.FC<ServiceDetailsProps> = ({
  serviceName,
  environment = '',
  initialTab = 'overview',
  timeRange,
  onTimeChange,
  onRefresh: _onRefresh,
  refreshTrigger,
}) => {
  const { config, loading: configLoading, error: configError } = useApmConfig();

  // State for active tab
  const [activeTab, setActiveTab] = useState<ServiceDetailsTabId>(initialTab);

  // Helper to parse URL params from hash
  const parseUrlParams = useCallback((): ServiceDetailsUrlParams => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    // Parse query params from hash
    const hashQueryIndex = hash.indexOf('?');
    const hashParams =
      hashQueryIndex >= 0 ? new URLSearchParams(hash.substring(hashQueryIndex + 1)) : params;

    return {
      serviceName,
      environment,
      tab:
        (hashParams.get(SERVICE_DETAILS_CONSTANTS.URL_PARAMS.TAB) as ServiceDetailsTabId) ||
        initialTab,
      from: hashParams.get(SERVICE_DETAILS_CONSTANTS.URL_PARAMS.FROM) || undefined,
      to: hashParams.get(SERVICE_DETAILS_CONSTANTS.URL_PARAMS.TO) || undefined,
    };
  }, [serviceName, environment, initialTab]);

  // Parse URL params on mount
  useEffect(() => {
    const urlParams = parseUrlParams();

    // Set tab from URL
    if (urlParams.tab && urlParams.tab !== activeTab) {
      setActiveTab(urlParams.tab);
    }

    // Set time range from URL (notify parent)
    if (urlParams.from && urlParams.to) {
      onTimeChange({ from: urlParams.from, to: urlParams.to });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceName, environment, initialTab, onTimeChange, parseUrlParams]);

  // Listen for URL hash changes and update tab
  useEffect(() => {
    const handleHashChange = () => {
      const urlParams = parseUrlParams();
      if (urlParams.tab && urlParams.tab !== activeTab) {
        setActiveTab(urlParams.tab);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [parseUrlParams, activeTab]);

  // Update URL when state changes
  const updateUrl = useCallback(
    (newTab?: ServiceDetailsTabId, newTimeRange?: TimeRange) => {
      const tab = newTab || activeTab;
      const time = newTimeRange || timeRange;

      const params = new URLSearchParams();
      params.set(SERVICE_DETAILS_CONSTANTS.URL_PARAMS.TAB, tab);
      params.set(SERVICE_DETAILS_CONSTANTS.URL_PARAMS.FROM, time.from);
      params.set(SERVICE_DETAILS_CONSTANTS.URL_PARAMS.TO, time.to);

      const encodedServiceName = encodeURIComponent(serviceName);
      const encodedEnvironment = encodeURIComponent(environment || 'default');

      // Update hash with params
      const newHash = `#/service-details/${encodedServiceName}/${encodedEnvironment}?${params.toString()}`;
      window.history.replaceState(null, '', newHash);
    },
    [serviceName, environment, activeTab, timeRange]
  );

  // Handle tab change
  const handleTabChange = useCallback(
    (tab: EuiTabbedContentTab) => {
      const tabId = tab.id as ServiceDetailsTabId;
      setActiveTab(tabId);
      updateUrl(tabId);
    },
    [updateUrl]
  );

  // Get Prometheus connection ID from config
  const prometheusConnectionId = useMemo(() => {
    return config?.prometheusDataSource?.id || '';
  }, [config]);

  // Get service map dataset from config
  const serviceMapDataset = useMemo(() => {
    return config?.serviceMapDataset?.id || '';
  }, [config]);

  // Define tabs
  const tabs: EuiTabbedContentTab[] = useMemo(
    () => [
      {
        id: SERVICE_DETAILS_CONSTANTS.TABS.OVERVIEW,
        name: i18n.translate('observability.apm.serviceDetails.tabs.overview', {
          defaultMessage: 'Overview',
        }),
        content: (
          <ServiceOverview
            serviceName={serviceName}
            environment={environment}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            serviceMapDataset={serviceMapDataset}
            refreshTrigger={refreshTrigger}
          />
        ),
      },
      {
        id: SERVICE_DETAILS_CONSTANTS.TABS.OPERATIONS,
        name: i18n.translate('observability.apm.serviceDetails.tabs.operations', {
          defaultMessage: 'Operations',
        }),
        content: (
          <ServiceOperations
            serviceName={serviceName}
            environment={environment}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            serviceMapDataset={serviceMapDataset}
            refreshTrigger={refreshTrigger}
          />
        ),
      },
      {
        id: SERVICE_DETAILS_CONSTANTS.TABS.DEPENDENCIES,
        name: i18n.translate('observability.apm.serviceDetails.tabs.dependencies', {
          defaultMessage: 'Dependencies',
        }),
        content: (
          <ServiceDependencies
            serviceName={serviceName}
            environment={environment}
            timeRange={timeRange}
            prometheusConnectionId={prometheusConnectionId}
            serviceMapDataset={serviceMapDataset}
            refreshTrigger={refreshTrigger}
          />
        ),
      },
    ],
    [serviceName, environment, timeRange, prometheusConnectionId, serviceMapDataset, refreshTrigger]
  );

  // Get selected tab
  const selectedTab = useMemo(() => {
    return tabs.find((tab) => tab.id === activeTab) || tabs[0];
  }, [tabs, activeTab]);

  // Show loading state while config loads
  if (configLoading) {
    return (
      <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 400 }}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="xl" />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  // Show error if config failed to load
  if (configError) {
    return (
      <EuiCallOut
        title={i18n.translate('observability.apm.serviceDetails.configError', {
          defaultMessage: 'Failed to load APM configuration',
        })}
        color="danger"
        iconType="alert"
      >
        <p>{configError.message}</p>
      </EuiCallOut>
    );
  }

  // Show error if no config exists
  if (!config) {
    return (
      <EuiCallOut
        title={i18n.translate('observability.apm.serviceDetails.noConfig', {
          defaultMessage: 'APM not configured',
        })}
        color="warning"
        iconType="alert"
      >
        <p>
          {i18n.translate('observability.apm.serviceDetails.noConfigMessage', {
            defaultMessage: 'Please configure APM settings to view service details.',
          })}
        </p>
      </EuiCallOut>
    );
  }

  return (
    <EuiPage data-test-subj="serviceDetails" style={{ padding: '0px 16px 0px 16px' }}>
      <EuiPageBody>
        <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
          <EuiPageContentBody>
            {/* Tabbed Content - time picker is now in header area */}
            <EuiTabbedContent
              tabs={tabs}
              selectedTab={selectedTab}
              onTabClick={handleTabChange}
              autoFocus="initial"
            />
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};
