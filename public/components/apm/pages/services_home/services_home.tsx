/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiInMemoryTable,
  EuiBasicTableColumn,
  EuiSpacer,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiButtonIcon,
  EuiToolTip,
  EuiCheckboxGroup,
  EuiAccordion,
  EuiFieldSearch,
  EuiText,
  EuiHorizontalRule,
  EuiResizableContainer,
} from '@elastic/eui';
import get from 'lodash/get';
import { ChromeBreadcrumb, CoreStart } from '../../../../../../../src/core/public';
import { DataPublicPluginStart } from '../../../../../../../src/plugins/data/public';
import { useServices } from '../../shared/hooks/use_services';
import { useServicesRedMetrics } from '../../shared/hooks/use_services_red_metrics';
import { ApmPageHeader } from '../../shared/components/apm_page_header';
import { EmptyState } from '../../shared/components/empty_state';
import { LanguageIcon } from '../../shared/components/language_icon';
import { MetricSparkline } from '../../shared/components/metric_sparkline';
import { TopServicesByFaultRate } from '../../shared/components/fault_widgets/top_services_by_fault_rate';
import { TopDependenciesByFaultRate } from '../../shared/components/fault_widgets/top_dependencies_by_fault_rate';
import { TimeRange, ServiceTableItem } from '../../common/types/service_types';
import { parseTimeRange } from '../../shared/utils/time_utils';
import { parseEnvironmentType } from '../../query_services/query_requests/response_processor';
import { navigateToServiceMap } from '../../shared/utils/navigation_utils';
import { ServiceDetailsFlyout } from './service_details_flyout';
import {
  LatencyRangeFilter,
  ThroughputRangeFilter,
  FailureRateThresholdFilter,
  matchesAnyFailureRateThreshold,
} from '../../shared/components/filters';
import {
  getEnvironmentDisplayName,
  APM_CONSTANTS,
  ENVIRONMENT_PLATFORM_MAP,
} from '../../common/constants';
import { servicesI18nTexts as i18nTexts } from './services_home_i18n';

const AVAILABLE_ENVIRONMENTS = Object.values(ENVIRONMENT_PLATFORM_MAP);

export interface ServicesHomeProps {
  chrome: any;
  parentBreadcrumb: ChromeBreadcrumb;
  onServiceClick?: (serviceName: string, environment: string) => void;
  coreStart: CoreStart;
  dataService: DataPublicPluginStart;
}

interface FlyoutState {
  serviceName: string;
  environment: string;
  tab: 'spans' | 'logs';
}

/**
 * ServicesHome - Main page listing all APM services
 *
 * Shows:
 * - Filterable table of services
 * - Service name, environment
 * - Click to navigate to service details
 */
export const ServicesHome: React.FC<ServicesHomeProps> = ({
  chrome,
  parentBreadcrumb,
  onServiceClick,
  coreStart,
  dataService,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>({
    from: 'now-15m',
    to: 'now',
  });

  // Flyout state
  const [flyoutState, setFlyoutState] = useState<FlyoutState | null>(null);

  const [selectedEnvironments, setSelectedEnvironments] = useState<Record<string, boolean>>({});
  const [selectedGroupByAttributes, setSelectedGroupByAttributes] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [attributeSearchQueries, setAttributeSearchQueries] = useState<Record<string, string>>({});
  const [expandedAttributes, setExpandedAttributes] = useState<Record<string, boolean>>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Metric filter state
  const [latencyRange, setLatencyRange] = useState<[number, number]>([0, 0]);
  const [throughputRange, setThroughputRange] = useState<[number, number]>([0, 0]);
  const [selectedFailureRateThresholds, setSelectedFailureRateThresholds] = useState<string[]>([]);

  // Set breadcrumbs
  React.useEffect(() => {
    chrome.setBreadcrumbs([
      parentBreadcrumb,
      {
        text: i18nTexts.breadcrumb,
        href: '#/services',
      },
    ]);
  }, [chrome, parentBreadcrumb]);

  const parsedTimeRange = useMemo(() => parseTimeRange(timeRange), [timeRange]);

  const { data: services, isLoading, error, availableGroupByAttributes, refetch } = useServices({
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    refreshTrigger,
  });

  const handleTimeChange = useCallback((newTimeRange: TimeRange) => {
    setTimeRange(newTimeRange);
  }, []);

  // Filtered attribute values based on search queries
  const filteredAttributeValues = useMemo(() => {
    const result: Record<string, string[]> = {};

    Object.entries(availableGroupByAttributes || {}).forEach(([attrPath, values]) => {
      const attrSearchQuery = attributeSearchQueries[attrPath] || '';
      if (!attrSearchQuery) {
        result[attrPath] = values;
      } else {
        const searchLower = attrSearchQuery.toLowerCase();
        result[attrPath] = values.filter((v) => v.toLowerCase().includes(searchLower));
      }
    });

    return result;
  }, [availableGroupByAttributes, attributeSearchQueries]);

  // Create checkbox options for environments
  const environmentCheckboxes = useMemo(() => {
    return AVAILABLE_ENVIRONMENTS.map((env) => ({
      id: env,
      label: env,
    }));
  }, []);

  // Handle environment filter changes
  const onEnvironmentChange = useCallback((id: string) => {
    setSelectedEnvironments((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  // Handle select all for a specific attribute
  const handleSelectAllForAttribute = useCallback(
    (attrPath: string) => {
      const allValues = filteredAttributeValues[attrPath] || [];
      const newSelections: Record<string, boolean> = {};
      allValues.forEach((value) => {
        newSelections[value] = true;
      });

      setSelectedGroupByAttributes((prev) => ({
        ...prev,
        [attrPath]: newSelections,
      }));
    },
    [filteredAttributeValues]
  );

  // Handle clear all for a specific attribute
  const handleClearAllForAttribute = useCallback((attrPath: string) => {
    setSelectedGroupByAttributes((prev) => ({
      ...prev,
      [attrPath]: {},
    }));
  }, []);

  // Handle search change for a specific attribute
  const handleSearchChange = useCallback((attrPath: string, searchValue: string) => {
    setAttributeSearchQueries((prev) => ({
      ...prev,
      [attrPath]: searchValue,
    }));
  }, []);

  // Apply search, environment and groupByAttributes filtering
  const fullyFilteredItems = useMemo(() => {
    let filtered = [...(services || [])];

    // Filter by search query (service name or environment)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (service) =>
          service.serviceName.toLowerCase().includes(query) ||
          service.environment.toLowerCase().includes(query)
      );
    }

    // Filter by environment (platform type)
    const hasSelectedEnvironments = Object.values(selectedEnvironments).some((v) => v);
    if (hasSelectedEnvironments) {
      filtered = filtered.filter((service) => {
        const envDetails = parseEnvironmentType(service.environment);
        const platform = envDetails.platform.toUpperCase();

        // Map platform to filter options
        const matchKey = ENVIRONMENT_PLATFORM_MAP[platform] || '';

        return selectedEnvironments[matchKey] === true;
      });
    }

    // Filter by groupByAttributes
    const hasGroupByAttributeFilters = Object.keys(selectedGroupByAttributes).some((attrPath) =>
      Object.values(selectedGroupByAttributes[attrPath]).some((v) => v)
    );

    if (hasGroupByAttributeFilters) {
      filtered = filtered.filter((service) => {
        // Check if service matches any selected groupByAttribute values
        for (const [attrPath, selectedValues] of Object.entries(selectedGroupByAttributes)) {
          const hasSelectedValues = Object.entries(selectedValues).some(
            ([_val, isSelected]) => isSelected
          );
          if (!hasSelectedValues) continue;

          // Get service's value for this attribute path
          const serviceValue = get(service.groupByAttributes || {}, attrPath);

          // Check if service's value is selected
          const matches = Object.entries(selectedValues).some(
            ([val, isSelected]) => isSelected && String(serviceValue) === val
          );

          if (!matches) return false;
        }
        return true;
      });
    }

    return filtered;
  }, [services, searchQuery, selectedEnvironments, selectedGroupByAttributes]);

  // Fetch RED (Request rate, Error rate, Duration) metrics for ALL services
  // Fetched separately and before filtering to avoid re-fetching on filter changes
  const { metricsMap, isLoading: metricsLoading, refetch: refetchMetrics } = useServicesRedMetrics({
    services: (services || []).map((s) => ({
      serviceName: s.serviceName,
      environment: s.environment,
    })),
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
  });

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
    refetch();
    refetchMetrics();
  }, [refetch, refetchMetrics]);

  // Compute min/max values for range filters based on filtered services' metrics
  const metricRanges = useMemo(() => {
    if (metricsMap.size === 0 || fullyFilteredItems.length === 0) {
      return {
        latencyMin: 0,
        latencyMax: 1000,
        throughputMin: 0,
        throughputMax: 100,
      };
    }

    let latencyMin = Infinity;
    let latencyMax = -Infinity;
    let throughputMin = Infinity;
    let throughputMax = -Infinity;

    // Iterate only over filtered services' metrics
    fullyFilteredItems.forEach((service) => {
      const metrics = metricsMap.get(service.serviceName);
      if (!metrics) return;

      // Get latest latency value (converted to ms)
      const latencyData = metrics.latency || [];
      if (latencyData.length > 0) {
        const latencyMs = latencyData[latencyData.length - 1].value * 1000;
        latencyMin = Math.min(latencyMin, latencyMs);
        latencyMax = Math.max(latencyMax, latencyMs);
      }

      // Get latest throughput value
      const throughputData = metrics.throughput || [];
      if (throughputData.length > 0) {
        const throughputVal = throughputData[throughputData.length - 1].value;
        throughputMin = Math.min(throughputMin, throughputVal);
        throughputMax = Math.max(throughputMax, throughputVal);
      }
    });

    // Handle case where no valid data was found
    if (!isFinite(latencyMin)) latencyMin = 0;
    if (!isFinite(latencyMax)) latencyMax = 1000;
    if (!isFinite(throughputMin)) throughputMin = 0;
    if (!isFinite(throughputMax)) throughputMax = 100;

    // Round to nice values
    latencyMin = Math.floor(latencyMin);
    latencyMax = Math.ceil(latencyMax);
    throughputMin = Math.floor(throughputMin);
    throughputMax = Math.ceil(throughputMax);

    return { latencyMin, latencyMax, throughputMin, throughputMax };
  }, [metricsMap, fullyFilteredItems]);

  // Sync selected ranges to metricRanges whenever they change
  useEffect(() => {
    setLatencyRange([metricRanges.latencyMin, metricRanges.latencyMax]);
    setThroughputRange([metricRanges.throughputMin, metricRanges.throughputMax]);
  }, [metricRanges]);

  // Apply metric filters for display (on top of already filtered items)
  const displayedServices = useMemo(() => {
    let filtered = [...fullyFilteredItems];

    // Only apply metric filters if we have metrics data
    if (metricsMap.size === 0) {
      return filtered;
    }

    // Filter by latency range (only if range has been adjusted from full range)
    const isLatencyFilterActive =
      latencyRange[0] > metricRanges.latencyMin || latencyRange[1] < metricRanges.latencyMax;
    if (isLatencyFilterActive) {
      filtered = filtered.filter((service) => {
        const metrics = metricsMap.get(service.serviceName);
        if (!metrics || metrics.latency.length === 0) return false;
        const latencyMs = metrics.latency[metrics.latency.length - 1].value * 1000;
        return latencyMs >= latencyRange[0] && latencyMs <= latencyRange[1];
      });
    }

    // Filter by throughput range (only if range has been adjusted from full range)
    const isThroughputFilterActive =
      throughputRange[0] > metricRanges.throughputMin ||
      throughputRange[1] < metricRanges.throughputMax;
    if (isThroughputFilterActive) {
      filtered = filtered.filter((service) => {
        const metrics = metricsMap.get(service.serviceName);
        if (!metrics || metrics.throughput.length === 0) return false;
        const throughputVal = metrics.throughput[metrics.throughput.length - 1].value;
        return throughputVal >= throughputRange[0] && throughputVal <= throughputRange[1];
      });
    }

    // Filter by failure rate threshold (OR logic - match ANY selected threshold)
    if (selectedFailureRateThresholds.length > 0) {
      filtered = filtered.filter((service) => {
        const metrics = metricsMap.get(service.serviceName);
        if (!metrics || metrics.failureRatio.length === 0) return false;
        const failureRatio = metrics.failureRatio[metrics.failureRatio.length - 1].value;
        return matchesAnyFailureRateThreshold(failureRatio, selectedFailureRateThresholds);
      });
    }

    return filtered;
  }, [
    fullyFilteredItems,
    metricsMap,
    metricRanges,
    latencyRange,
    throughputRange,
    selectedFailureRateThresholds,
  ]);

  const columns: Array<EuiBasicTableColumn<ServiceTableItem>> = useMemo(
    () => [
      {
        field: 'serviceName',
        name: i18nTexts.table.serviceName,
        sortable: true,
        width: '20%',
        render: (serviceName: string, item: ServiceTableItem) => {
          const language = item.groupByAttributes?.telemetry?.sdk?.language;

          return (
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <LanguageIcon language={language} size="m" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiLink
                  onClick={() => {
                    if (onServiceClick) {
                      onServiceClick(serviceName, item.environment);
                    }
                  }}
                  data-test-subj={`serviceLink-${serviceName}`}
                >
                  <strong>{serviceName}</strong>
                </EuiLink>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        field: 'environment',
        name: i18nTexts.table.environment,
        sortable: true,
        align: 'center',
        width: '10%',
        render: (environment: string) => {
          return <EuiText size="s">{getEnvironmentDisplayName(environment)}</EuiText>;
        },
      },
      {
        field: 'latency' as any,
        name: i18nTexts.table.latencyP95,
        width: '21%',
        align: 'center',
        sortable: (item: ServiceTableItem) => {
          if (!item?.serviceName) return 0;
          const metrics = metricsMap.get(item.serviceName);
          const latency = metrics?.latency || [];
          return latency.length > 0 ? latency[latency.length - 1].value : 0;
        },
        render: (_fieldValue: any, item: ServiceTableItem) => {
          const metrics = metricsMap.get(item.serviceName);
          const latencyData = metrics?.latency || [];
          const latestValue =
            latencyData.length > 0 ? latencyData[latencyData.length - 1].value : 0;
          const latencyMs = (latestValue * 1000).toFixed(0);

          return (
            <EuiFlexGroup
              direction="row"
              gutterSize="xs"
              justifyContent="center"
              responsive={false}
            >
              <EuiFlexItem grow={false} style={{ minWidth: '60px' }}>
                <EuiText size="s">{latencyMs} ms</EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <MetricSparkline
                  data={latencyData}
                  isLoading={metricsLoading}
                  color={APM_CONSTANTS.COLORS.LATENCY}
                  height={APM_CONSTANTS.SPARKLINE_HEIGHT}
                  width={APM_CONSTANTS.SPARKLINE_WIDTH}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        field: 'throughput' as any,
        name: i18nTexts.table.throughput,
        width: '21%',
        align: 'center',
        sortable: (item: ServiceTableItem) => {
          if (!item?.serviceName) return 0;
          const metrics = metricsMap.get(item.serviceName);
          const throughput = metrics?.throughput || [];
          return throughput.length > 0 ? throughput[throughput.length - 1].value : 0;
        },
        render: (_fieldValue: any, item: ServiceTableItem) => {
          const metrics = metricsMap.get(item.serviceName);
          const throughputData = metrics?.throughput || [];
          const latestValue =
            throughputData.length > 0 ? throughputData[throughputData.length - 1].value : 0;
          const throughputFormatted = latestValue.toFixed(0);

          return (
            <EuiFlexGroup
              direction="row"
              gutterSize="xs"
              justifyContent="center"
              responsive={false}
            >
              <EuiFlexItem grow={false} style={{ minWidth: '70px' }}>
                <EuiText size="s">{throughputFormatted} req/m</EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <MetricSparkline
                  data={throughputData}
                  isLoading={metricsLoading}
                  color={APM_CONSTANTS.COLORS.THROUGHPUT}
                  height={APM_CONSTANTS.SPARKLINE_HEIGHT}
                  width={APM_CONSTANTS.SPARKLINE_WIDTH}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        field: 'failureRatio' as any,
        name: i18nTexts.table.failureRatio,
        width: '21%',
        align: 'center',
        sortable: (item: ServiceTableItem) => {
          if (!item?.serviceName) return 0;
          const metrics = metricsMap.get(item.serviceName);
          const failure = metrics?.failureRatio || [];
          return failure.length > 0 ? failure[failure.length - 1].value : 0;
        },
        render: (_fieldValue: any, item: ServiceTableItem) => {
          const metrics = metricsMap.get(item.serviceName);
          const failureData = metrics?.failureRatio || [];
          const latestValue =
            failureData.length > 0 ? failureData[failureData.length - 1].value : 0;
          const failureFormatted = latestValue.toFixed(1);

          return (
            <EuiFlexGroup
              direction="row"
              gutterSize="xs"
              justifyContent="center"
              responsive={false}
            >
              <EuiFlexItem grow={false} style={{ minWidth: '50px' }}>
                <EuiText size="s">{failureFormatted}%</EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <MetricSparkline
                  data={failureData}
                  isLoading={metricsLoading}
                  color={APM_CONSTANTS.COLORS.FAILURE_RATE}
                  height={APM_CONSTANTS.SPARKLINE_HEIGHT}
                  width={APM_CONSTANTS.SPARKLINE_WIDTH}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        name: i18nTexts.table.actions,
        width: '7%',
        align: 'center',
        render: (item: ServiceTableItem) => (
          <EuiFlexGroup
            gutterSize="s"
            responsive={false}
            alignItems="center"
            justifyContent="center"
          >
            <EuiFlexItem grow={false}>
              <EuiToolTip content={i18nTexts.actions.viewServiceMap}>
                <EuiButtonIcon
                  iconType="graphApp"
                  aria-label={i18nTexts.actions.viewServiceMap}
                  onClick={() => navigateToServiceMap(item.serviceName, item.environment)}
                  data-test-subj={`serviceMapButton-${item.serviceName}`}
                />
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={i18nTexts.actions.viewLogs}>
                <EuiButtonIcon
                  iconType="discoverApp"
                  aria-label={i18nTexts.actions.viewLogs}
                  onClick={() =>
                    setFlyoutState({
                      serviceName: item.serviceName,
                      environment: item.environment,
                      tab: 'logs',
                    })
                  }
                  data-test-subj={`serviceLogsButton-${item.serviceName}`}
                />
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={i18nTexts.actions.viewSpans}>
                <EuiButtonIcon
                  iconType="apmTrace"
                  aria-label={i18nTexts.actions.viewSpans}
                  onClick={() =>
                    setFlyoutState({
                      serviceName: item.serviceName,
                      environment: item.environment,
                      tab: 'spans',
                    })
                  }
                  data-test-subj={`serviceSpansButton-${item.serviceName}`}
                />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
      },
    ],
    [onServiceClick, metricsMap, metricsLoading]
  );

  if (error) {
    return (
      <EuiPage data-test-subj="servicesPage">
        <EuiPageBody>
          <EuiPageContent>
            <EuiPageContentBody>
              <EuiCallOut title={i18nTexts.error.title} color="danger" iconType="alert">
                <p>{error.message}</p>
              </EuiCallOut>
            </EuiPageContentBody>
          </EuiPageContent>
        </EuiPageBody>
      </EuiPage>
    );
  }

  const showEmptyState = !isLoading && (!services || services.length === 0);

  return (
    <EuiPage data-test-subj="servicesPage">
      <EuiPageBody component="main">
        <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
          <EuiPageContentBody>
            {/* Search bar and time filter */}
            <ApmPageHeader
              timeRange={timeRange}
              onTimeChange={handleTimeChange}
              onRefresh={handleRefresh}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />

            {/* Empty state when no services found */}
            {showEmptyState ? (
              <EuiPanel style={{ marginTop: '8px' }}>
                <EmptyState
                  title={i18nTexts.empty.title}
                  body={i18nTexts.empty.body}
                  iconType="search"
                />
              </EuiPanel>
            ) : (
              /* Main content with resizable filter sidebar */
              <EuiResizableContainer>
                {(EuiResizablePanel, EuiResizableButton, { togglePanel }) => (
                  <>
                    {/* Left Side: Filter Sidebar - Collapsible */}
                    <EuiResizablePanel
                      mode={['custom', { position: 'top' }]}
                      id="filter-sidebar"
                      initialSize={15}
                      minSize="10%"
                      paddingSize="none"
                      style={{ paddingTop: '8px', paddingRight: '8px', paddingBottom: '8px' }}
                    >
                      <EuiPanel style={{ height: '100%' }}>
                        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                          <EuiFlexItem grow={false}>
                            <strong>{i18nTexts.filters.title}</strong>
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiButtonIcon
                              color="text"
                              aria-label={i18nTexts.filters.toggleAriaLabel}
                              iconType="menuLeft"
                              onClick={() => togglePanel('filter-sidebar', { direction: 'left' })}
                              data-test-subj="filter-sidebar-toggle"
                            />
                          </EuiFlexItem>
                        </EuiFlexGroup>

                        <EuiHorizontalRule margin="xs" />

                        {/* Environment Filter - Accordion */}
                        <EuiAccordion
                          id="environmentAccordion"
                          buttonContent={
                            <EuiText size="xs">
                              <strong>{i18nTexts.filters.environment}</strong>
                            </EuiText>
                          }
                          initialIsOpen={true}
                          data-test-subj="environmentAccordion"
                        >
                          <EuiSpacer size="xs" />

                          {/* Checkbox group */}
                          {environmentCheckboxes.length > 0 ? (
                            <EuiCheckboxGroup
                              options={environmentCheckboxes}
                              idToSelectedMap={selectedEnvironments}
                              onChange={onEnvironmentChange}
                              compressed
                              data-test-subj="environment-checkboxGroup"
                            />
                          ) : (
                            <EuiText size="s" color="subdued">
                              {i18nTexts.filters.noEnvironments}
                            </EuiText>
                          )}
                        </EuiAccordion>

                        <EuiHorizontalRule margin="xs" />

                        {/* Latency Filter - Accordion */}
                        <EuiAccordion
                          id="latencyAccordion"
                          buttonContent={
                            <EuiText size="xs">
                              <strong>{i18nTexts.filters.latency}</strong>
                            </EuiText>
                          }
                          initialIsOpen={true}
                          data-test-subj="latencyAccordion"
                        >
                          <EuiSpacer size="xs" />
                          <LatencyRangeFilter
                            value={latencyRange}
                            onChange={setLatencyRange}
                            min={metricRanges.latencyMin}
                            max={metricRanges.latencyMax}
                            dataTestSubj="latencyRangeFilter"
                          />
                        </EuiAccordion>

                        <EuiHorizontalRule margin="xs" />

                        {/* Throughput Filter - Accordion */}
                        <EuiAccordion
                          id="throughputAccordion"
                          buttonContent={
                            <EuiText size="xs">
                              <strong>{i18nTexts.filters.throughput}</strong>
                            </EuiText>
                          }
                          initialIsOpen={true}
                          data-test-subj="throughputAccordion"
                        >
                          <EuiSpacer size="xs" />
                          <ThroughputRangeFilter
                            value={throughputRange}
                            onChange={setThroughputRange}
                            min={metricRanges.throughputMin}
                            max={metricRanges.throughputMax}
                            dataTestSubj="throughputRangeFilter"
                          />
                        </EuiAccordion>

                        <EuiHorizontalRule margin="xs" />

                        {/* Failure Rate Filter - Accordion */}
                        <EuiAccordion
                          id="failureRateAccordion"
                          buttonContent={
                            <EuiText size="xs">
                              <strong>{i18nTexts.filters.failureRatio}</strong>
                            </EuiText>
                          }
                          initialIsOpen={true}
                          data-test-subj="failureRateAccordion"
                        >
                          <EuiSpacer size="s" />
                          <FailureRateThresholdFilter
                            selectedThresholds={selectedFailureRateThresholds}
                            onSelectionChange={setSelectedFailureRateThresholds}
                            dataTestSubj="failureRateThresholdFilter"
                          />
                        </EuiAccordion>

                        <EuiHorizontalRule margin="xs" />

                        {/* Dynamic GroupByAttributes Filters - Accordion Structure */}
                        {availableGroupByAttributes &&
                          Object.keys(availableGroupByAttributes).length > 0 && (
                            <>
                              <EuiAccordion
                                id="attributesAccordion"
                                buttonContent={
                                  <EuiText size="s">
                                    <strong>{i18nTexts.filters.attributes}</strong>
                                  </EuiText>
                                }
                                initialIsOpen={true}
                                data-test-subj="attributesAccordion"
                              >
                                <EuiSpacer size="s" />

                                {/* Inner accordions for each attribute */}
                                {Object.entries(availableGroupByAttributes).map(
                                  ([attrPath, _values], index) => {
                                    const filteredValues = filteredAttributeValues[attrPath] || [];
                                    const attrSearchQuery = attributeSearchQueries[attrPath] || '';
                                    const isExpanded = expandedAttributes[attrPath] || false;
                                    const displayedValues = isExpanded
                                      ? filteredValues
                                      : filteredValues.slice(
                                          0,
                                          APM_CONSTANTS.ATTRIBUTE_VALUES_INITIAL_LIMIT
                                        );
                                    const remainingCount =
                                      filteredValues.length -
                                      APM_CONSTANTS.ATTRIBUTE_VALUES_INITIAL_LIMIT;

                                    return (
                                      <React.Fragment key={attrPath}>
                                        {index > 0 && <EuiHorizontalRule margin="xs" />}

                                        <EuiAccordion
                                          id={`attribute-${attrPath}-accordion`}
                                          buttonContent={
                                            <EuiText size="xs">
                                              <strong>{attrPath}</strong>
                                            </EuiText>
                                          }
                                          initialIsOpen={false}
                                          data-test-subj={`attribute-${attrPath}-accordion`}
                                        >
                                          <EuiSpacer size="s" />

                                          {/* Search box */}
                                          <EuiFieldSearch
                                            placeholder=""
                                            value={attrSearchQuery}
                                            onChange={(e) =>
                                              handleSearchChange(attrPath, e.target.value)
                                            }
                                            isClearable
                                            fullWidth
                                            compressed
                                            data-test-subj={`attribute-${attrPath}-search`}
                                          />

                                          <EuiSpacer size="s" />

                                          {/* Select all / Clear all links */}
                                          {filteredValues.length > 0 && (
                                            <>
                                              <EuiFlexGroup
                                                gutterSize="s"
                                                justifyContent="spaceBetween"
                                              >
                                                <EuiFlexItem grow={false}>
                                                  <EuiLink
                                                    onClick={() =>
                                                      handleSelectAllForAttribute(attrPath)
                                                    }
                                                    data-test-subj={`attribute-${attrPath}-selectAll`}
                                                    color="primary"
                                                  >
                                                    <EuiText size="xs">
                                                      {i18nTexts.filters.selectAll}
                                                    </EuiText>
                                                  </EuiLink>
                                                </EuiFlexItem>
                                                <EuiFlexItem grow={false}>
                                                  <EuiLink
                                                    onClick={() =>
                                                      handleClearAllForAttribute(attrPath)
                                                    }
                                                    data-test-subj={`attribute-${attrPath}-clearAll`}
                                                    color="primary"
                                                  >
                                                    <EuiText size="xs">
                                                      {i18nTexts.filters.clearAll}
                                                    </EuiText>
                                                  </EuiLink>
                                                </EuiFlexItem>
                                              </EuiFlexGroup>
                                              <EuiSpacer size="s" />
                                            </>
                                          )}

                                          {/* Checkbox list */}
                                          {filteredValues.length > 0 ? (
                                            <>
                                              <EuiCheckboxGroup
                                                options={displayedValues.map((value) => ({
                                                  id: value,
                                                  label: value,
                                                }))}
                                                idToSelectedMap={
                                                  selectedGroupByAttributes[attrPath] || {}
                                                }
                                                onChange={(id) => {
                                                  setSelectedGroupByAttributes((prev) => ({
                                                    ...prev,
                                                    [attrPath]: {
                                                      ...(prev[attrPath] || {}),
                                                      [id]: !prev[attrPath]?.[id],
                                                    },
                                                  }));
                                                }}
                                                compressed
                                                data-test-subj={`attribute-${attrPath}-checkboxGroup`}
                                              />
                                              {/* Show more / Show less link */}
                                              {filteredValues.length >
                                                APM_CONSTANTS.ATTRIBUTE_VALUES_INITIAL_LIMIT && (
                                                <>
                                                  <EuiSpacer size="xs" />
                                                  <EuiLink
                                                    onClick={() =>
                                                      setExpandedAttributes((prev) => ({
                                                        ...prev,
                                                        [attrPath]: !prev[attrPath],
                                                      }))
                                                    }
                                                    data-test-subj={`attribute-${attrPath}-showMore`}
                                                  >
                                                    <EuiText size="xs">
                                                      {isExpanded
                                                        ? i18nTexts.filters.showLess
                                                        : `+${remainingCount} more`}
                                                    </EuiText>
                                                  </EuiLink>
                                                </>
                                              )}
                                            </>
                                          ) : (
                                            <EuiText size="s" color="subdued">
                                              {i18nTexts.filters.noMatchingValues}
                                            </EuiText>
                                          )}
                                        </EuiAccordion>
                                      </React.Fragment>
                                    );
                                  }
                                )}
                              </EuiAccordion>
                            </>
                          )}
                      </EuiPanel>
                    </EuiResizablePanel>

                    <EuiResizableButton />

                    {/* Right Side: Main Content */}
                    <EuiResizablePanel
                      id="main-content"
                      initialSize={85}
                      minSize="50%"
                      paddingSize="none"
                      scrollable={false}
                      style={{ padding: '8px 0px 8px 8px' }}
                    >
                      {/* Top Widgets Row */}
                      <EuiFlexGroup gutterSize="s" direction="row" alignItems="stretch">
                        <TopServicesByFaultRate
                          timeRange={timeRange}
                          onServiceClick={onServiceClick}
                          refreshTrigger={refreshTrigger}
                          searchQuery={searchQuery}
                        />
                        <TopDependenciesByFaultRate
                          timeRange={timeRange}
                          refreshTrigger={refreshTrigger}
                          onServiceClick={onServiceClick}
                          searchQuery={searchQuery}
                        />
                      </EuiFlexGroup>

                      <EuiSpacer size="s" />

                      {/* Services Table */}
                      <EuiPanel>
                        {displayedServices.length === 0 ? (
                          <EmptyState
                            title={i18nTexts.noMatching.title}
                            body={i18nTexts.noMatching.body}
                            iconType="search"
                          />
                        ) : (
                          <EuiInMemoryTable
                            items={displayedServices}
                            columns={columns}
                            pagination={{
                              initialPageSize: APM_CONSTANTS.DEFAULT_PAGE_SIZE,
                              pageSizeOptions: [...APM_CONSTANTS.PAGE_SIZE_OPTIONS],
                            }}
                            sorting={{
                              sort: {
                                field: 'serviceName',
                                direction: 'asc',
                              },
                            }}
                            loading={isLoading}
                            data-test-subj="servicesTable"
                          />
                        )}
                      </EuiPanel>
                    </EuiResizablePanel>
                  </>
                )}
              </EuiResizableContainer>
            )}
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiPageBody>

      {/* Service Details Flyout */}
      {flyoutState && (
        <ServiceDetailsFlyout
          serviceName={flyoutState.serviceName}
          environment={flyoutState.environment}
          timeRange={timeRange}
          initialTab={flyoutState.tab}
          onClose={() => setFlyoutState(null)}
          coreStart={coreStart}
          dataService={dataService}
        />
      )}
    </EuiPage>
  );
};
