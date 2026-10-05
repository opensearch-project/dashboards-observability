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
import { isServiceDetailsHashPath } from '../../shared/utils/navigation_utils';
import { useApmConfig } from '../../config/apm_config_context';
import { ServiceOverview } from './service_overview';
import { ServiceOperations } from './service_operations';
import { ServiceDependencies } from './service_dependencies';
import { ServiceSloTab, SloTabLabel } from './service_slo_tab';
import { SloApiClient } from '../slos/slo_api_client';
import { toSloHealthAccessError, useServiceSloHealth } from '../slos/slo_health_summary';
import { coreRefs } from '../../../../framework/core_refs';
import {
  TimeRange,
  ServiceDetailsTabId,
  ServiceDetailsUrlParams,
} from '../../common/types/service_details_types';
import { SERVICE_DETAILS_CONSTANTS } from '../../common/constants';
import { ApmCursorContext, createApmCursorBus } from '../../shared/hooks/apm_cursor_context';
import {
  readUrlTimeRange,
  splitHash,
  useTimeRangeUrlSync,
} from '../../shared/hooks/use_time_range_url_sync';
import '../../shared/styles/apm_common.scss';

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

  // One cursor bus for the whole page. EuiTabbedContent mounts only the active
  // tab, so a single bus scopes the synced crosshair to that tab's charts.
  const cursorBus = useMemo(() => createApmCursorBus(), []);

  // Whether a hash path is this page (`#/service-details/<service>/<env>`). URL writes are
  // skipped otherwise, so leaving by a hash link (breadcrumb, another service) is never
  // rewritten back to this service.
  const isThisPagePath = useCallback(
    (hashPath: string) => isServiceDetailsHashPath(hashPath, serviceName, environment),
    [serviceName, environment]
  );

  // Helper to parse URL params from hash. `from`/`to` are only returned when both are valid.
  const parseUrlParams = useCallback((): ServiceDetailsUrlParams => {
    const { params: hashParams } = splitHash();
    const urlRange = readUrlTimeRange(hashParams);

    return {
      serviceName,
      environment,
      tab:
        (hashParams.get(SERVICE_DETAILS_CONSTANTS.URL_PARAMS.TAB) as ServiceDetailsTabId) ||
        initialTab,
      from: urlRange?.from,
      to: urlRange?.to,
    };
  }, [serviceName, environment, initialTab]);

  // Parse URL params on mount
  useEffect(() => {
    if (!isThisPagePath(splitHash().path)) return;
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

  // Update URL when state changes. Keeps the current hash path and every other param
  // (e.g. `lang`, used for the breadcrumb icon); a no-op once the URL is another page's.
  const updateUrl = useCallback(
    (newTab?: ServiceDetailsTabId, newTimeRange?: TimeRange) => {
      const { path, params } = splitHash();
      if (!isThisPagePath(path)) return;
      const time = newTimeRange || timeRange;
      params.set(SERVICE_DETAILS_CONSTANTS.URL_PARAMS.TAB, newTab || activeTab);
      params.set(SERVICE_DETAILS_CONSTANTS.URL_PARAMS.FROM, time.from);
      params.set(SERVICE_DETAILS_CONSTANTS.URL_PARAMS.TO, time.to);
      window.history.replaceState(null, '', `${path}?${params.toString()}`);
    },
    [isThisPagePath, activeTab, timeRange]
  );

  // Listen for URL hash changes and update tab and time range. A deep link to the
  // same service with a different `from`/`to` only changes the hash, so without
  // this the charts would stay on the previous range while the URL shows the new one.
  // Backfilling a hash with no range is handled by useTimeRangeUrlSync.
  useEffect(() => {
    const handleHashChange = () => {
      if (!isThisPagePath(splitHash().path)) return;
      const urlParams = parseUrlParams();
      if (urlParams.tab && urlParams.tab !== activeTab) {
        setActiveTab(urlParams.tab);
      }
      if (
        urlParams.from &&
        urlParams.to &&
        (urlParams.from !== timeRange.from || urlParams.to !== timeRange.to)
      ) {
        onTimeChange({ from: urlParams.from, to: urlParams.to });
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isThisPagePath, parseUrlParams, activeTab, timeRange, onTimeChange]);

  // Keep URL `from`/`to` in sync with the page time range and backfill a URL without one.
  useTimeRangeUrlSync({
    timeRange,
    isCurrentPage: isThisPagePath,
    pageKey: `${serviceName}/${environment || ''}`,
  });

  // Handle tab change
  const handleTabChange = useCallback(
    (tab: EuiTabbedContentTab) => {
      const tabId = tab.id as ServiceDetailsTabId;
      setActiveTab(tabId);
      updateUrl(tabId);
    },
    [updateUrl]
  );

  // Handle a chart brush selection: zoom the whole page time range (all charts
  // re-query) and persist it to the URL. Charts report ISO-8601 start/end.
  const handleTimeRangeChange = useCallback(
    (from: string, to: string) => {
      const newRange = { from, to };
      onTimeChange(newRange);
      updateUrl(undefined, newRange);
    },
    [onTimeChange, updateUrl]
  );

  // Get Prometheus connection ID from config
  // Use .name (connectionId) for PromQL queries, not .id (saved object ID)
  const prometheusConnectionId = useMemo(() => {
    return config?.prometheusDataSource?.name || '';
  }, [config]);

  // Get service map dataset from config
  const serviceMapDataset = useMemo(() => {
    return config?.serviceMapDataset?.id || '';
  }, [config]);

  // SLO health for both the tab-label breach badge and the SLOs tab content.
  // Parent-owned so the page issues one `list()` instead of two (M5B).
  const sloApiClient = useMemo(() => {
    const http = coreRefs.http;
    return http ? new SloApiClient(http) : undefined;
  }, []);
  const sloApiClientStub = useMemo(
    () =>
      ({
        list: () =>
          Promise.resolve({
            results: [],
            total: 0,
            pageSize: 0,
            hasMore: false,
            nextCursor: null,
            prevCursor: null,
          }),
      }) as unknown as SloApiClient,
    []
  );
  // Feature flag: when `observability.slo.enabled` is false the SLOs tab is
  // hidden entirely and the rollup hook short-circuits. Mirrors the existing
  // "no datasource → disabled" path.
  const sloFeatureEnabled = !!coreRefs.sloEnabled;
  const sloHealthDisabled = !sloFeatureEnabled || !sloApiClient || !prometheusConnectionId;
  const tabSloHealth = useServiceSloHealth({
    serviceNames: sloHealthDisabled ? [] : [serviceName],
    datasourceId: sloHealthDisabled ? '' : prometheusConnectionId,
    apiClient: sloApiClient ?? sloApiClientStub,
  });
  const sloBucket = tabSloHealth.bySvc.get(serviceName);
  const breachedCount = sloBucket?.breached ?? 0;
  const sloAccessError = useMemo(
    () => toSloHealthAccessError(tabSloHealth.error),
    [tabSloHealth.error]
  );

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
            onTimeRangeChange={handleTimeRangeChange}
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
            onTimeRangeChange={handleTimeRangeChange}
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
            onTimeRangeChange={handleTimeRangeChange}
          />
        ),
      },
      ...(sloFeatureEnabled
        ? [
            {
              id: SERVICE_DETAILS_CONSTANTS.TABS.SLOS,
              // The tab label carries the breached-count badge so users spot an
              // active breach without opening the tab. Badge is suppressed at zero.
              name: (
                <span data-test-subj="serviceDetailsTabSlos">
                  <SloTabLabel breached={breachedCount} />
                </span>
              ),
              content: (
                <ServiceSloTab
                  serviceName={serviceName}
                  bucket={sloBucket}
                  isLoading={tabSloHealth.isLoading}
                  error={sloAccessError}
                  refetch={tabSloHealth.refetch}
                  timeRange={timeRange}
                />
              ),
            },
          ]
        : []),
    ],
    [
      serviceName,
      environment,
      timeRange,
      prometheusConnectionId,
      serviceMapDataset,
      refreshTrigger,
      handleTimeRangeChange,
      breachedCount,
      sloBucket,
      sloAccessError,
      tabSloHealth.isLoading,
      tabSloHealth.refetch,
      sloFeatureEnabled,
    ]
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
            <ApmCursorContext.Provider value={cursorBus}>
              <EuiTabbedContent
                tabs={tabs}
                selectedTab={selectedTab}
                onTabClick={handleTabChange}
                autoFocus="initial"
              />
            </ApmCursorContext.Provider>
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};
