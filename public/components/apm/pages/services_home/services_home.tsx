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
  EuiButtonGroup,
  EuiToolTip,
  EuiCheckboxGroup,
  EuiAccordion,
  EuiFieldSearch,
  EuiText,
  EuiHorizontalRule,
  EuiResizableContainer,
  EuiIcon,
} from '@elastic/eui';
import get from 'lodash/get';
import { ChromeBreadcrumb } from '../../../../../../../src/core/public';
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
import {
  navigateToServiceMap,
  navigateToServiceDetails,
} from '../../shared/utils/navigation_utils';
import { ServiceCorrelationsFlyout } from '../../shared/components/service_correlations_flyout';
import {
  LatencyRangeFilter,
  ThroughputRangeFilter,
  FailureRateThresholdFilter,
  ErrorRateThreshold,
  matchesErrorRateThreshold,
  THRESHOLD_LABELS,
} from '../../shared/components/filters';
import { ActiveFilterBadges, FilterBadge } from '../../shared/components/active_filter_badges';
import {
  getEnvironmentDisplayName,
  APM_CONSTANTS,
  ENVIRONMENT_PLATFORM_MAP,
} from '../../common/constants';
import { servicesI18nTexts as i18nTexts } from './services_home_i18n';
import { formatThroughput } from '../../common/format_utils';

const AVAILABLE_ENVIRONMENTS = Object.values(ENVIRONMENT_PLATFORM_MAP);

const LATENCY_PERCENTILE_OPTIONS = [
  { id: 'p99', label: 'P99' },
  { id: 'p90', label: 'P90' },
  { id: 'p50', label: 'P50' },
];

export interface ServicesHomeProps {
  chrome: any;
  parentBreadcrumb: ChromeBreadcrumb;
  onServiceClick?: (
    serviceName: string,
    environment: string,
    language?: string,
    timeRange?: TimeRange
  ) => void;
}

interface FlyoutState {
  serviceName: string;
  environment: string;
  language?: string;
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
  const [selectedFailureRateThresholds, setSelectedFailureRateThresholds] = useState<
    ErrorRateThreshold[]
  >([]);

  // Latency percentile selector state
  const [latencyPercentile, setLatencyPercentile] = useState<'p99' | 'p90' | 'p50'>('p99');

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
    latencyPercentile,
  });

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
    refetch();
    refetchMetrics();
  }, [refetch, refetchMetrics]);

  // Combined loading state for table and filters
  const isTableLoading = isLoading || metricsLoading;

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

      // Get average latency value over the time period (already in ms from PromQL)
      const avgLatency = metrics.avgLatency || 0;
      if (avgLatency > 0) {
        latencyMin = Math.min(latencyMin, avgLatency);
        latencyMax = Math.max(latencyMax, avgLatency);
      }

      // Get average throughput value over the time period
      const avgThroughput = metrics.avgThroughput || 0;
      if (avgThroughput > 0) {
        throughputMin = Math.min(throughputMin, avgThroughput);
        throughputMax = Math.max(throughputMax, avgThroughput);
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
        if (!metrics) return false;
        // Use average latency for filtering
        const avgLatency = metrics.avgLatency || 0;
        return avgLatency >= latencyRange[0] && avgLatency <= latencyRange[1];
      });
    }

    // Filter by throughput range (only if range has been adjusted from full range)
    const isThroughputFilterActive =
      throughputRange[0] > metricRanges.throughputMin ||
      throughputRange[1] < metricRanges.throughputMax;
    if (isThroughputFilterActive) {
      filtered = filtered.filter((service) => {
        const metrics = metricsMap.get(service.serviceName);
        if (!metrics) return false;
        // Filter by total throughput over the time period
        const avgThroughput = metrics.avgThroughput || 0;
        return avgThroughput >= throughputRange[0] && avgThroughput <= throughputRange[1];
      });
    }

    // Filter by failure rate threshold (OR logic - match ANY selected threshold)
    if (selectedFailureRateThresholds.length > 0) {
      filtered = filtered.filter((service) => {
        const metrics = metricsMap.get(service.serviceName);
        if (!metrics) return false;
        // Use average failure ratio for filtering
        const avgFailureRatio = metrics.avgFailureRatio || 0;
        return selectedFailureRateThresholds.some((threshold) =>
          matchesErrorRateThreshold(avgFailureRatio, threshold)
        );
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

  // Build active filter badges from current filter state
  const activeFilters: FilterBadge[] = useMemo(() => {
    const badges: FilterBadge[] = [];

    // Environment filter badges
    const selectedEnvValues = Object.entries(selectedEnvironments)
      .filter(([_, isSelected]) => isSelected)
      .map(([env]) => env);
    if (selectedEnvValues.length > 0) {
      badges.push({
        key: 'environment',
        category: i18nTexts.filters.environment,
        values: selectedEnvValues,
        onRemove: () => setSelectedEnvironments({}),
      });
    }

    // Latency range filter badge (only if modified from default bounds)
    const isLatencyModified =
      latencyRange[0] > metricRanges.latencyMin || latencyRange[1] < metricRanges.latencyMax;
    if (isLatencyModified) {
      badges.push({
        key: 'latency',
        category: i18nTexts.filters.latency,
        values: [`${latencyRange[0].toFixed(0)}-${latencyRange[1].toFixed(0)}ms`],
        onRemove: () => setLatencyRange([metricRanges.latencyMin, metricRanges.latencyMax]),
      });
    }

    // Throughput range filter badge (only if modified from default bounds)
    const isThroughputModified =
      throughputRange[0] > metricRanges.throughputMin ||
      throughputRange[1] < metricRanges.throughputMax;
    if (isThroughputModified) {
      badges.push({
        key: 'throughput',
        category: i18nTexts.filters.throughput,
        values: [
          `${formatThroughput(throughputRange[0])} - ${formatThroughput(throughputRange[1])}`,
        ],
        onRemove: () =>
          setThroughputRange([metricRanges.throughputMin, metricRanges.throughputMax]),
      });
    }

    // Failure rate threshold badges (display labels from THRESHOLD_LABELS)
    if (selectedFailureRateThresholds.length > 0) {
      badges.push({
        key: 'failureRate',
        category: i18nTexts.filters.failureRatio,
        values: selectedFailureRateThresholds.map(
          (threshold) => THRESHOLD_LABELS.errorRate[threshold]
        ),
        onRemove: () => setSelectedFailureRateThresholds([]),
      });
    }

    // GroupByAttributes filter badges
    Object.entries(selectedGroupByAttributes).forEach(([attrPath, selections]) => {
      const selectedValues = Object.entries(selections)
        .filter(([_, isSelected]) => isSelected)
        .map(([value]) => value);
      if (selectedValues.length > 0) {
        badges.push({
          key: `attr-${attrPath}`,
          category: attrPath,
          values: selectedValues,
          onRemove: () =>
            setSelectedGroupByAttributes((prev) => ({
              ...prev,
              [attrPath]: {},
            })),
        });
      }
    });

    return badges;
  }, [
    selectedEnvironments,
    latencyRange,
    throughputRange,
    selectedFailureRateThresholds,
    selectedGroupByAttributes,
    metricRanges,
  ]);

  // Clear all filters handler
  const handleClearAllFilters = useCallback(() => {
    setSelectedEnvironments({});
    setLatencyRange([metricRanges.latencyMin, metricRanges.latencyMax]);
    setThroughputRange([metricRanges.throughputMin, metricRanges.throughputMax]);
    setSelectedFailureRateThresholds([]);
    setSelectedGroupByAttributes({});
  }, [metricRanges]);

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
                      onServiceClick(serviceName, item.environment, language, timeRange);
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
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>{i18nTexts.table.actions}</EuiFlexItem>
          </EuiFlexGroup>
        ),
        width: '10%',
        align: 'center',
        render: (item: ServiceTableItem) => (
          <EuiFlexGroup
            gutterSize="s"
            responsive={false}
            alignItems="center"
            justifyContent="center"
          >
            <EuiFlexItem grow={false}>
              <EuiToolTip content={i18nTexts.actions.viewLogs}>
                <EuiButtonIcon
                  iconType="discoverApp"
                  autoFocus={false}
                  aria-label={i18nTexts.actions.viewLogs}
                  onClick={() =>
                    setFlyoutState({
                      serviceName: item.serviceName,
                      environment: item.environment,
                      language: item.groupByAttributes?.telemetry?.sdk?.language,
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
                      language: item.groupByAttributes?.telemetry?.sdk?.language,
                      tab: 'spans',
                    })
                  }
                  data-test-subj={`serviceSpansButton-${item.serviceName}`}
                />
              </EuiToolTip>
            </EuiFlexItem>
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
          </EuiFlexGroup>
        ),
      },
      {
        field: 'latency' as any,
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem
              grow={false}
            >{`Avg. Latency (${latencyPercentile.toUpperCase()})`}</EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={i18nTexts.tableTooltips.latency}>
                <EuiIcon type="questionInCircle" size="s" color="subdued" />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        width: '21%',
        align: 'center',
        sortable: (item: ServiceTableItem) => {
          if (!item?.serviceName) return 0;
          const metrics = metricsMap.get(item.serviceName);
          return metrics?.avgLatency || 0;
        },
        render: (_fieldValue: any, item: ServiceTableItem) => {
          const metrics = metricsMap.get(item.serviceName);
          const latencyData = metrics?.latency || [];
          // Use average latency over the time period
          const avgLatency = metrics?.avgLatency || 0;
          const latencyMs = avgLatency.toFixed(0);

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
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>{i18nTexts.table.throughput}</EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={i18nTexts.tableTooltips.throughput}>
                <EuiIcon type="questionInCircle" size="s" color="subdued" />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        width: '21%',
        align: 'center',
        sortable: (item: ServiceTableItem) => {
          if (!item?.serviceName) return 0;
          const metrics = metricsMap.get(item.serviceName);
          // Sort by average throughput over the time period
          return metrics?.avgThroughput || 0;
        },
        render: (_fieldValue: any, item: ServiceTableItem) => {
          const metrics = metricsMap.get(item.serviceName);
          const throughputData = metrics?.throughput || [];
          // Display average throughput over the time period
          const avgThroughput = metrics?.avgThroughput || 0;
          const throughputFormatted = formatThroughput(avgThroughput);

          return (
            <EuiFlexGroup
              direction="row"
              gutterSize="xs"
              justifyContent="center"
              responsive={false}
            >
              <EuiFlexItem grow={false} style={{ minWidth: '90px' }}>
                <EuiText size="s">{throughputFormatted}</EuiText>
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
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>{i18nTexts.table.failureRatio}</EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={i18nTexts.tableTooltips.failureRatio}>
                <EuiIcon type="questionInCircle" size="s" color="subdued" />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        width: '100px',
        align: 'center',
        sortable: (item: ServiceTableItem) => {
          if (!item?.serviceName) return 0;
          const metrics = metricsMap.get(item.serviceName);
          return metrics?.avgFailureRatio || 0;
        },
        render: (_fieldValue: any, item: ServiceTableItem) => {
          const metrics = metricsMap.get(item.serviceName);
          const failureData = metrics?.failureRatio || [];
          // Use average failure ratio over the time period
          const avgFailureRatio = metrics?.avgFailureRatio || 0;
          const failureFormatted = avgFailureRatio.toFixed(1);

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
        field: 'environment',
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>{i18nTexts.table.environment}</EuiFlexItem>
          </EuiFlexGroup>
        ),
        sortable: true,
        align: 'center',
        width: '10%',
        render: (environment: string) => {
          return <EuiText size="s">{getEnvironmentDisplayName(environment)}</EuiText>;
        },
      },
    ],
    [onServiceClick, metricsMap, metricsLoading, timeRange, latencyPercentile]
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

            {/* Active filter badges */}
            {activeFilters.length > 0 && (
              <>
                <EuiSpacer size="s" />
                <ActiveFilterBadges
                  filters={activeFilters}
                  onClearAll={handleClearAllFilters}
                  disabled={isTableLoading}
                />
              </>
            )}

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
                      style={{ paddingTop: '8px', paddingRight: '8px' }}
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
                              disabled={isTableLoading}
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
                            disabled={isTableLoading}
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
                            disabled={isTableLoading}
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
                            disabled={isTableLoading}
                          />
                        </EuiAccordion>

                        <EuiHorizontalRule margin="xs" />

                        {/* Dynamic GroupByAttributes Filters */}
                        {availableGroupByAttributes &&
                          Object.keys(availableGroupByAttributes).length > 0 && (
                            <>
                              <EuiText size="s" data-test-subj="attributesTitle">
                                <strong>{i18nTexts.filters.attributes}</strong>
                              </EuiText>
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
                                        initialIsOpen={index === 0}
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
                                          disabled={isTableLoading}
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
                                              disabled={isTableLoading}
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
                      style={{ padding: '8px 0px 0px 8px' }}
                    >
                      {/* Top Widgets Row */}
                      <EuiFlexGroup gutterSize="s" direction="row" alignItems="stretch">
                        <TopServicesByFaultRate
                          timeRange={timeRange}
                          onServiceClick={(serviceName, environment) => {
                            if (onServiceClick) {
                              onServiceClick(serviceName, environment, undefined, timeRange);
                            }
                          }}
                          refreshTrigger={refreshTrigger}
                          searchQuery={searchQuery}
                        />
                        <TopDependenciesByFaultRate
                          timeRange={timeRange}
                          refreshTrigger={refreshTrigger}
                          onServiceClick={(serviceName, environment) => {
                            if (onServiceClick) {
                              onServiceClick(serviceName, environment, undefined, timeRange);
                            }
                          }}
                          onDependencyClick={(sourceService, dependencyService, environment) => {
                            navigateToServiceDetails(sourceService, environment, {
                              tab: 'dependencies',
                              dependency: dependencyService,
                              timeRange,
                            });
                          }}
                          searchQuery={searchQuery}
                        />
                      </EuiFlexGroup>

                      <EuiSpacer size="s" />

                      {/* Services Table */}
                      <EuiPanel>
                        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                          <EuiFlexItem grow={false}>
                            <EuiText size="m">
                              <h4>Service Catalog</h4>
                            </EuiText>
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <EuiFlexGroup gutterSize="s" alignItems="center">
                              <EuiFlexItem grow={false}>
                                <EuiText size="s">
                                  <strong>Latency</strong>
                                </EuiText>
                              </EuiFlexItem>
                              <EuiFlexItem grow={false}>
                                <EuiButtonGroup
                                  legend="Select latency percentile"
                                  options={LATENCY_PERCENTILE_OPTIONS}
                                  idSelected={latencyPercentile}
                                  onChange={(id) =>
                                    setLatencyPercentile(id as 'p99' | 'p90' | 'p50')
                                  }
                                  buttonSize="compressed"
                                />
                              </EuiFlexItem>
                            </EuiFlexGroup>
                          </EuiFlexItem>
                        </EuiFlexGroup>
                        <EuiSpacer size="s" />
                        {!isTableLoading && displayedServices.length === 0 ? (
                          <EmptyState
                            title={i18nTexts.noMatching.title}
                            body={i18nTexts.noMatching.body}
                            iconType="search"
                          />
                        ) : (
                          <EuiInMemoryTable
                            items={isTableLoading ? [] : displayedServices}
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
                            loading={isTableLoading}
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

      {/* Service Correlations Flyout */}
      {flyoutState && (
        <ServiceCorrelationsFlyout
          serviceName={flyoutState.serviceName}
          environment={flyoutState.environment}
          language={flyoutState.language}
          timeRange={timeRange}
          initialTab={flyoutState.tab}
          onClose={() => setFlyoutState(null)}
        />
      )}
    </EuiPage>
  );
};
