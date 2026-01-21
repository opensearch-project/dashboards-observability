/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  EuiInMemoryTable,
  EuiBasicTableColumn,
  EuiPanel,
  EuiSpacer,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiButtonIcon,
  EuiToolTip,
  EuiText,
  EuiFieldSearch,
  EuiSuperSelect,
  EuiIcon,
  EuiResizableContainer,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TimeRange, GroupedDependency } from '../../common/types/service_details_types';
import { PromQLLineChart } from '../../shared/components/promql_line_chart';
import { SERVICE_DETAILS_CONSTANTS } from '../../common/constants';
import {
  getQueryDependencyRequestsOverTime,
  getQueryDependencyFaultsAndErrorsOverTime,
  getQueryDependencyLatencyPercentilesOverTime,
} from '../../query_services/query_requests/promql_queries';
import { useDependencies } from '../../shared/hooks/use_dependencies';
import { useDependencyMetrics } from '../../shared/hooks/use_dependency_metrics';
import { parseTimeRange } from '../../shared/utils/time_utils';
import { DependencyFilterSidebar } from '../../shared/components/dependency_filter_sidebar';
import { ActiveFilterBadges, FilterBadge } from '../../shared/components/active_filter_badges';
import { formatCount, formatLatency } from '../../common/format_utils';

// Filter threshold constants
const AVAILABILITY_THRESHOLDS = ['< 95%', '95-99%', '≥ 99%'];
const ERROR_RATE_THRESHOLDS = ['< 1%', '1-5%', '> 5%'];

// Latency percentile options for EuiSuperSelect
const LATENCY_OPTIONS = [
  { value: 'p99', inputDisplay: 'P99' },
  { value: 'p90', inputDisplay: 'P90' },
  { value: 'p50', inputDisplay: 'P50' },
];

// Tooltip content for column headers
const tableTooltips = {
  latency: i18n.translate('observability.apm.dependencies.tooltip.latency', {
    defaultMessage: 'Response time at the selected percentile over the time range',
  }),
  requests: i18n.translate('observability.apm.dependencies.tooltip.requests', {
    defaultMessage: 'Total number of requests in the selected time range',
  }),
  errorRate: i18n.translate('observability.apm.dependencies.tooltip.errorRate', {
    defaultMessage: 'Percentage of requests with client errors (4xx)',
  }),
  availability: i18n.translate('observability.apm.dependencies.tooltip.availability', {
    defaultMessage: 'Percentage of successful requests (excludes 5xx server faults)',
  }),
};

// Threshold matching functions
// Note: All values from PromQL are already in percentage (0-100) format
const matchesAvailabilityThreshold = (
  availability: number | undefined,
  threshold: string
): boolean => {
  if (availability === undefined) return false;
  if (threshold === '< 95%') return availability < 95;
  if (threshold === '95-99%') return availability >= 95 && availability < 99;
  if (threshold === '≥ 99%') return availability >= 99;
  return false;
};

const matchesRateThreshold = (rate: number | undefined, threshold: string): boolean => {
  if (rate === undefined) return false;
  if (threshold === '< 1%') return rate < 1;
  if (threshold === '1-5%') return rate >= 1 && rate <= 5;
  if (threshold === '> 5%') return rate > 5;
  return false;
};

export interface ServiceDependenciesProps {
  serviceName: string;
  environment?: string;
  timeRange: TimeRange;
  prometheusConnectionId: string;
  serviceMapDataset: string;
  refreshTrigger?: number;
}

/**
 * ServiceDependencies - Dependencies tab for service details
 *
 * Layout:
 * - Filter sidebar (left)
 * - Dependencies table (right) with expandable rows
 *
 * Table columns:
 * | Expand | Dependency Service | Remote Operation | Service Operation(s) | Latency | Requests | Error Rate | Availability |
 *
 * Expanded row content:
 * - 3 charts side-by-side: Requests & Availability, Faults & Errors, Latency Percentiles
 */
export const ServiceDependencies: React.FC<ServiceDependenciesProps> = ({
  serviceName,
  environment = '',
  timeRange,
  prometheusConnectionId,
  serviceMapDataset: _serviceMapDataset,
  refreshTrigger,
}) => {
  // Expandable rows state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const expandedRowsRef = useRef<Set<string>>(expandedRows);
  expandedRowsRef.current = expandedRows;
  const hasAutoExpandedRef = useRef(false);

  // Helper to parse URL params from hash
  const getUrlParams = () => {
    const hash = window.location.hash;
    const hashQueryIndex = hash.indexOf('?');
    if (hashQueryIndex >= 0) {
      return new URLSearchParams(hash.substring(hashQueryIndex + 1));
    }
    return new URLSearchParams();
  };

  // Filter sidebar state - initialized from URL params
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>(() => {
    const params = getUrlParams();
    const dep = params.get('dependency');
    return dep ? [dep] : [];
  });
  const [selectedServiceOperations, setSelectedServiceOperations] = useState<string[]>(() => {
    const params = getUrlParams();
    const op = params.get('operation');
    return op ? [op] : [];
  });
  const [selectedRemoteOperations, setSelectedRemoteOperations] = useState<string[]>([]);

  // Listen for URL hash changes and update filter state
  useEffect(() => {
    const handleHashChange = () => {
      const params = getUrlParams();
      const dep = params.get('dependency');
      const op = params.get('operation');

      if (dep) {
        setSelectedDependencies([dep]);
      }
      if (op) {
        setSelectedServiceOperations([op]);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Threshold filter states
  const [selectedAvailabilityThresholds, setSelectedAvailabilityThresholds] = useState<string[]>(
    []
  );
  const [selectedErrorRateThresholds, setSelectedErrorRateThresholds] = useState<string[]>([]);

  // Search and latency selector state
  const [searchQuery, setSearchQuery] = useState('');
  const [latencyPercentile, setLatencyPercentile] = useState<'p99' | 'p90' | 'p50'>('p99');

  // Range filter states
  const [latencyRange, setLatencyRange] = useState<[number, number]>([0, 10000]);
  const [requestsRange, setRequestsRange] = useState<[number, number]>([0, 100000]);

  // Parse time range
  const parsedTimeRange = useMemo(() => {
    try {
      return parseTimeRange(timeRange);
    } catch (e) {
      console.error('[ServiceDependencies] Failed to parse time range:', e);
      return {
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(),
      };
    }
  }, [timeRange]);

  // Fetch dependencies list from PPL
  const {
    groupedData: dependenciesData,
    isLoading: depsLoading,
    error: depsError,
  } = useDependencies({
    serviceName,
    environment,
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    refreshTrigger,
  });

  // Fetch Prometheus metrics for dependencies
  const { metrics: dependencyMetrics, isLoading: metricsLoading } = useDependencyMetrics({
    dependencies: dependenciesData || [],
    serviceName,
    environment: environment || 'generic:default',
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    prometheusConnectionId,
    refreshTrigger,
  });

  // Merge dependencies with metrics
  const dependencies: GroupedDependency[] = useMemo(() => {
    if (!dependenciesData) return [];
    return dependenciesData.map((dep) => {
      const key = `${dep.serviceName}:${dep.remoteOperation}`;
      const metrics = dependencyMetrics.get(key);
      return {
        ...dep,
        requestCount: metrics?.requestCount ?? 0, // Use Prometheus request count
        p50Duration: metrics?.p50Duration,
        p90Duration: metrics?.p90Duration,
        p99Duration: metrics?.p99Duration,
        faultRate: metrics?.faultRate,
        errorRate: metrics?.errorRate,
        availability: metrics?.availability,
      };
    });
  }, [dependenciesData, dependencyMetrics]);

  // Extract unique values for filter sidebar
  const dependencyNames = useMemo(() => {
    const names = new Set(dependencies.map((dep) => dep.serviceName));
    return Array.from(names).sort();
  }, [dependencies]);

  const remoteOperations = useMemo(() => {
    const ops = new Set(dependencies.map((dep) => dep.remoteOperation).filter(Boolean));
    return Array.from(ops).sort();
  }, [dependencies]);

  const serviceOperations = useMemo(() => {
    const ops = new Set<string>();
    dependencies.forEach((dep) => {
      if (dep.serviceOperations) {
        dep.serviceOperations.forEach((op) => ops.add(op));
      }
    });
    return Array.from(ops).sort();
  }, [dependencies]);

  // Step 1: Apply text/category filters (before metric filters)
  // These are used to compute dynamic bounds for sliders
  const textFilteredDependencies = useMemo(() => {
    return dependencies.filter((dep) => {
      // Search filter - matches serviceName, remoteOperation, and serviceOperations
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const matchesServiceName = dep.serviceName.toLowerCase().includes(searchLower);
        const matchesRemoteOp = dep.remoteOperation?.toLowerCase().includes(searchLower);
        const matchesServiceOps = dep.serviceOperations?.some((op) =>
          op.toLowerCase().includes(searchLower)
        );
        if (!matchesServiceName && !matchesRemoteOp && !matchesServiceOps) {
          return false;
        }
      }

      // Dependency name filter
      if (selectedDependencies.length > 0 && !selectedDependencies.includes(dep.serviceName)) {
        return false;
      }

      // Remote operation filter
      if (
        selectedRemoteOperations.length > 0 &&
        !selectedRemoteOperations.includes(dep.remoteOperation)
      ) {
        return false;
      }

      // Service operations filter (dependency must have at least one matching service operation)
      if (selectedServiceOperations.length > 0) {
        if (
          !dep.serviceOperations ||
          !dep.serviceOperations.some((op) => selectedServiceOperations.includes(op))
        ) {
          return false;
        }
      }

      // Availability threshold filter (OR logic)
      if (selectedAvailabilityThresholds.length > 0) {
        const matchesAny = selectedAvailabilityThresholds.some((threshold) =>
          matchesAvailabilityThreshold(dep.availability, threshold)
        );
        if (!matchesAny) return false;
      }

      // Error rate threshold filter (OR logic)
      if (selectedErrorRateThresholds.length > 0) {
        const matchesAny = selectedErrorRateThresholds.some((threshold) =>
          matchesRateThreshold(dep.errorRate, threshold)
        );
        if (!matchesAny) return false;
      }

      return true;
    });
  }, [
    dependencies,
    searchQuery,
    selectedDependencies,
    selectedRemoteOperations,
    selectedServiceOperations,
    selectedAvailabilityThresholds,
    selectedErrorRateThresholds,
  ]);

  // Step 2: Calculate min/max bounds from text-filtered data
  // Use the selected percentile's duration for bounds calculation
  const latencyBounds = useMemo(() => {
    if (textFilteredDependencies.length === 0) return { min: 0, max: 10000 };
    const latencies = textFilteredDependencies
      .map((dep) => {
        if (latencyPercentile === 'p99') return dep.p99Duration;
        if (latencyPercentile === 'p90') return dep.p90Duration;
        return dep.p50Duration;
      })
      .filter((v): v is number => v !== undefined);
    if (latencies.length === 0) return { min: 0, max: 10000 };
    const min = Math.floor(Math.min(...latencies));
    const max = Math.ceil(Math.max(...latencies)) || 10000;
    return { min, max: Math.max(max, min + 1) };
  }, [textFilteredDependencies, latencyPercentile]);

  const requestsBounds = useMemo(() => {
    if (textFilteredDependencies.length === 0) return { min: 0, max: 100000 };
    const requests = textFilteredDependencies.map((dep) => dep.requestCount ?? 0);
    const min = Math.floor(Math.min(...requests));
    const max = Math.ceil(Math.max(...requests)) || 100000;
    return { min, max: Math.max(max, min + 1) };
  }, [textFilteredDependencies]);

  // Step 3: Reset slider ranges when bounds change
  useEffect(() => {
    setLatencyRange([latencyBounds.min, latencyBounds.max]);
  }, [latencyBounds.min, latencyBounds.max]);

  useEffect(() => {
    setRequestsRange([requestsBounds.min, requestsBounds.max]);
  }, [requestsBounds.min, requestsBounds.max]);

  // Step 4: Apply metric filters (latency, requests ranges) on top of text-filtered data
  const filteredDependencies = useMemo(() => {
    return textFilteredDependencies.filter((dep) => {
      // Latency range filter (only if range has been adjusted)
      const isLatencyFilterActive =
        latencyRange[0] > latencyBounds.min || latencyRange[1] < latencyBounds.max;
      if (isLatencyFilterActive) {
        // Use the selected percentile's duration for filtering
        const depLatency =
          latencyPercentile === 'p99'
            ? dep.p99Duration
            : latencyPercentile === 'p90'
            ? dep.p90Duration
            : dep.p50Duration;
        if (
          depLatency === undefined ||
          depLatency < latencyRange[0] ||
          depLatency > latencyRange[1]
        ) {
          return false;
        }
      }

      // Requests range filter (only if range has been adjusted)
      const isRequestsFilterActive =
        requestsRange[0] > requestsBounds.min || requestsRange[1] < requestsBounds.max;
      if (isRequestsFilterActive) {
        const depRequestCount = dep.requestCount ?? 0;
        if (depRequestCount < requestsRange[0] || depRequestCount > requestsRange[1]) {
          return false;
        }
      }

      return true;
    });
  }, [
    textFilteredDependencies,
    latencyRange,
    requestsRange,
    latencyBounds,
    requestsBounds,
    latencyPercentile,
  ]);

  const isLoading = depsLoading || metricsLoading;
  const error = depsError;

  // Build active filter badges from current filter state
  const activeFilters: FilterBadge[] = useMemo(() => {
    const badges: FilterBadge[] = [];

    // Dependencies filter badge
    if (selectedDependencies.length > 0) {
      badges.push({
        key: 'dependencies',
        category: i18n.translate('observability.apm.dependencies.filterCategory.dependency', {
          defaultMessage: 'Dependency',
        }),
        values: selectedDependencies,
        onRemove: () => setSelectedDependencies([]),
      });
    }

    // Service operations filter badge
    if (selectedServiceOperations.length > 0) {
      badges.push({
        key: 'serviceOperations',
        category: i18n.translate('observability.apm.dependencies.filterCategory.serviceOp', {
          defaultMessage: 'Service Op',
        }),
        values: selectedServiceOperations,
        onRemove: () => setSelectedServiceOperations([]),
      });
    }

    // Remote operations filter badge
    if (selectedRemoteOperations.length > 0) {
      badges.push({
        key: 'remoteOperations',
        category: i18n.translate('observability.apm.dependencies.filterCategory.remoteOp', {
          defaultMessage: 'Remote Op',
        }),
        values: selectedRemoteOperations,
        onRemove: () => setSelectedRemoteOperations([]),
      });
    }

    // Availability threshold badges
    if (selectedAvailabilityThresholds.length > 0) {
      badges.push({
        key: 'availability',
        category: i18n.translate('observability.apm.dependencies.filterCategory.availability', {
          defaultMessage: 'Availability',
        }),
        values: selectedAvailabilityThresholds,
        onRemove: () => setSelectedAvailabilityThresholds([]),
      });
    }

    // Error rate threshold badges
    if (selectedErrorRateThresholds.length > 0) {
      badges.push({
        key: 'errorRate',
        category: i18n.translate('observability.apm.dependencies.filterCategory.errorRate', {
          defaultMessage: 'Error Rate',
        }),
        values: selectedErrorRateThresholds,
        onRemove: () => setSelectedErrorRateThresholds([]),
      });
    }

    // Latency range filter badge (only if modified from default bounds)
    const isLatencyModified =
      latencyRange[0] > latencyBounds.min || latencyRange[1] < latencyBounds.max;
    if (isLatencyModified) {
      badges.push({
        key: 'latency',
        category: i18n.translate('observability.apm.dependencies.filterCategory.latency', {
          defaultMessage: 'Latency',
        }),
        values: [`${latencyRange[0].toFixed(0)}-${latencyRange[1].toFixed(0)}ms`],
        onRemove: () => setLatencyRange([latencyBounds.min, latencyBounds.max]),
      });
    }

    // Requests range filter badge (only if modified from default bounds)
    const isRequestsModified =
      requestsRange[0] > requestsBounds.min || requestsRange[1] < requestsBounds.max;
    if (isRequestsModified) {
      badges.push({
        key: 'requests',
        category: i18n.translate('observability.apm.dependencies.filterCategory.requests', {
          defaultMessage: 'Requests',
        }),
        values: [`${requestsRange[0].toFixed(0)}-${requestsRange[1].toFixed(0)}`],
        onRemove: () => setRequestsRange([requestsBounds.min, requestsBounds.max]),
      });
    }

    return badges;
  }, [
    selectedDependencies,
    selectedServiceOperations,
    selectedRemoteOperations,
    selectedAvailabilityThresholds,
    selectedErrorRateThresholds,
    latencyRange,
    requestsRange,
    latencyBounds,
    requestsBounds,
  ]);

  // Clear all filters handler
  const handleClearAllFilters = useCallback(() => {
    setSelectedDependencies([]);
    setSelectedServiceOperations([]);
    setSelectedRemoteOperations([]);
    setSelectedAvailabilityThresholds([]);
    setSelectedErrorRateThresholds([]);
    setLatencyRange([latencyBounds.min, latencyBounds.max]);
    setRequestsRange([requestsBounds.min, requestsBounds.max]);
  }, [latencyBounds, requestsBounds]);

  // Auto-expand the first row (lowest availability) on initial page load
  useEffect(() => {
    if (hasAutoExpandedRef.current || filteredDependencies.length === 0 || isLoading) {
      return;
    }

    // Find item with minimum availability (matches table sort: availability asc)
    const lowestAvailItem = filteredDependencies.reduce((min, curr) => {
      const minAvail = min.availability ?? Infinity;
      const currAvail = curr.availability ?? Infinity;
      return currAvail < minAvail ? curr : min;
    });

    const compositeKey = `${lowestAvailItem.serviceName}:${lowestAvailItem.remoteOperation}`;
    setExpandedRows(new Set([compositeKey]));
    hasAutoExpandedRef.current = true;
  }, [filteredDependencies, isLoading]);

  // Toggle expand/collapse for a row
  const toggleRowExpand = useCallback((compositeKey: string) => {
    setExpandedRows((current) => {
      const newSet = new Set(current);
      if (newSet.has(compositeKey)) {
        newSet.delete(compositeKey);
      } else {
        newSet.add(compositeKey);
      }
      return newSet;
    });
  }, []);

  // Note: rate values from PromQL are already in percentage (0-100) format
  const formatRate = (rate: number | undefined): React.ReactNode => {
    if (rate === undefined || isNaN(rate)) return '-';
    const percentage = rate.toFixed(2);
    const color = rate === 0 ? 'success' : rate > 5 ? 'danger' : rate > 1 ? 'warning' : 'success';
    return (
      <EuiToolTip content="< 1% = Healthy, 1-5% = Degraded, > 5% = Critical">
        <EuiHealth color={color}>{percentage}%</EuiHealth>
      </EuiToolTip>
    );
  };

  // Note: availability values from PromQL are already in percentage (0-100) format
  const formatAvailability = (avail: number | undefined): React.ReactNode => {
    if (avail === undefined || isNaN(avail)) return '-';
    const percentage = avail.toFixed(1);
    const color =
      avail === 0 ? 'danger' : avail >= 99 ? 'success' : avail >= 95 ? 'warning' : 'danger';
    return (
      <EuiToolTip content="≥ 99% = Healthy, 95-99% = Degraded, < 95% = Critical">
        <EuiHealth color={color}>{percentage}%</EuiHealth>
      </EuiToolTip>
    );
  };

  // Table columns
  const columns: Array<EuiBasicTableColumn<GroupedDependency>> = useMemo(
    () => [
      {
        name: '',
        width: '40px',
        render: (dependency: GroupedDependency) => {
          const compositeKey = `${dependency.serviceName}:${dependency.remoteOperation}`;
          return (
            <EuiButtonIcon
              onClick={() => toggleRowExpand(compositeKey)}
              iconType={expandedRowsRef.current.has(compositeKey) ? 'arrowDown' : 'arrowRight'}
              aria-label={expandedRowsRef.current.has(compositeKey) ? 'Collapse' : 'Expand'}
            />
          );
        },
      },
      {
        field: 'serviceName',
        name: i18n.translate('observability.apm.dependencies.dependencyService', {
          defaultMessage: 'Dependency service',
        }),
        sortable: true,
        width: '18%',
        truncateText: true,
        render: (name: string) => <strong>{name}</strong>,
      },
      {
        field: 'remoteOperation',
        name: i18n.translate('observability.apm.dependencies.remoteOp', {
          defaultMessage: 'Remote operation',
        }),
        sortable: true,
        width: '15%',
        truncateText: true,
        render: (operation: string) => operation || '-',
      },
      {
        field: 'serviceOperations',
        name: i18n.translate('observability.apm.dependencies.serviceOps', {
          defaultMessage: 'Service operation(s)',
        }),
        sortable: false,
        width: '15%',
        truncateText: true,
        render: (operations: string[]) => {
          if (!operations || operations.length === 0) return '-';
          const sortedOps = [...operations].sort();
          const displayText = sortedOps.join(', ');
          return (
            <EuiToolTip content={displayText}>
              <span>{displayText}</span>
            </EuiToolTip>
          );
        },
      },
      {
        field:
          latencyPercentile === 'p99'
            ? 'p99Duration'
            : latencyPercentile === 'p90'
            ? 'p90Duration'
            : 'p50Duration',
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              {i18n.translate('observability.apm.dependencies.latency', {
                defaultMessage: 'Latency ({percentile})',
                values: { percentile: latencyPercentile.toUpperCase() },
              })}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={tableTooltips.latency}>
                <EuiIcon type="questionInCircle" size="s" color="subdued" />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        sortable: true,
        width: '13%',
        render: formatLatency,
      },
      {
        field: 'requestCount',
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              {i18n.translate('observability.apm.dependencies.requests', {
                defaultMessage: 'Requests',
              })}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={tableTooltips.requests}>
                <EuiIcon type="questionInCircle" size="s" color="subdued" />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        sortable: true,
        width: '13%',
        render: (count: number | undefined) => formatCount(count ?? 0),
      },
      {
        field: 'errorRate',
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              {i18n.translate('observability.apm.dependencies.errorRate', {
                defaultMessage: 'Error rate',
              })}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={tableTooltips.errorRate}>
                <EuiIcon type="questionInCircle" size="s" color="subdued" />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        sortable: true,
        width: '13%',
        render: formatRate,
      },
      {
        field: 'availability',
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              {i18n.translate('observability.apm.dependencies.availability', {
                defaultMessage: 'Availability',
              })}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={tableTooltips.availability}>
                <EuiIcon type="questionInCircle" size="s" color="subdued" />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        sortable: true,
        width: '13%',
        render: formatAvailability,
      },
    ],
    [toggleRowExpand, latencyPercentile]
  );

  // Create expanded row content
  const itemIdToExpandedRowMap = useMemo(() => {
    const map: Record<string, React.ReactNode> = {};

    expandedRows.forEach((compositeKey) => {
      const dependency = dependencies.find(
        (dep) => `${dep.serviceName}:${dep.remoteOperation}` === compositeKey
      );
      if (dependency) {
        map[compositeKey] = (
          <EuiPanel color="subdued" paddingSize="m">
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="m">
              <EuiFlexItem>
                <PromQLLineChart
                  title="Requests"
                  promqlQuery={getQueryDependencyRequestsOverTime(
                    environment,
                    serviceName,
                    dependency.serviceName,
                    dependency.remoteOperation
                  )}
                  prometheusConnectionId={prometheusConnectionId}
                  timeRange={timeRange}
                  height={SERVICE_DETAILS_CONSTANTS.EXPANDED_ROW_CHART_HEIGHT}
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <PromQLLineChart
                  title="Faults and Errors"
                  promqlQuery={getQueryDependencyFaultsAndErrorsOverTime(
                    environment,
                    serviceName,
                    dependency.serviceName,
                    dependency.remoteOperation
                  )}
                  prometheusConnectionId={prometheusConnectionId}
                  timeRange={timeRange}
                  height={SERVICE_DETAILS_CONSTANTS.EXPANDED_ROW_CHART_HEIGHT}
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <PromQLLineChart
                  title="Latency (p50, p90, p99)"
                  promqlQuery={getQueryDependencyLatencyPercentilesOverTime(
                    environment,
                    serviceName,
                    dependency.serviceName,
                    dependency.remoteOperation
                  )}
                  prometheusConnectionId={prometheusConnectionId}
                  timeRange={timeRange}
                  height={SERVICE_DETAILS_CONSTANTS.EXPANDED_ROW_CHART_HEIGHT}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        );
      }
    });

    return map;
  }, [expandedRows, dependencies, environment, serviceName, timeRange, prometheusConnectionId]);

  if (error) {
    return (
      <EuiCallOut
        title={i18n.translate('observability.apm.dependencies.error', {
          defaultMessage: 'Error loading dependencies',
        })}
        color="danger"
        iconType="alert"
      >
        <p>{(error as Error).message}</p>
      </EuiCallOut>
    );
  }

  return (
    <div data-test-subj="serviceDependencies">
      <EuiSpacer size="m" />

      {/* Search bar and latency selector - at top under tabs */}
      <EuiFlexGroup gutterSize="m" alignItems="center">
        <EuiFlexItem>
          <EuiFieldSearch
            placeholder={i18n.translate('observability.apm.dependencies.searchPlaceholder', {
              defaultMessage: 'Filter dependencies...',
            })}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            isClearable
            fullWidth
            compressed
            disabled={isLoading}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSuperSelect
            options={LATENCY_OPTIONS}
            valueOfSelected={latencyPercentile}
            onChange={(value) => setLatencyPercentile(value as 'p99' | 'p90' | 'p50')}
            compressed
            prepend="Latency"
            disabled={isLoading}
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      {/* Active filter badges */}
      {activeFilters.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <ActiveFilterBadges
            filters={activeFilters}
            onClearAll={handleClearAllFilters}
            disabled={isLoading}
          />
        </>
      )}

      <EuiSpacer size="m" />

      <EuiResizableContainer>
        {(EuiResizablePanel, EuiResizableButton, { togglePanel }) => (
          <>
            {/* Filter Sidebar */}
            <EuiResizablePanel
              id="dependencies-filter-sidebar"
              initialSize={15}
              minSize="10%"
              mode={['custom', { position: 'top' }]}
              paddingSize="none"
              style={{ paddingRight: '8px' }}
            >
              <DependencyFilterSidebar
                availabilityThresholds={AVAILABILITY_THRESHOLDS}
                selectedAvailabilityThresholds={selectedAvailabilityThresholds}
                onAvailabilityThresholdsChange={setSelectedAvailabilityThresholds}
                errorRateThresholds={ERROR_RATE_THRESHOLDS}
                selectedErrorRateThresholds={selectedErrorRateThresholds}
                onErrorRateThresholdsChange={setSelectedErrorRateThresholds}
                dependencyNames={dependencyNames}
                selectedDependencies={selectedDependencies}
                onDependencyChange={setSelectedDependencies}
                serviceOperations={serviceOperations}
                selectedServiceOperations={selectedServiceOperations}
                onServiceOperationChange={setSelectedServiceOperations}
                remoteOperations={remoteOperations}
                selectedRemoteOperations={selectedRemoteOperations}
                onRemoteOperationChange={setSelectedRemoteOperations}
                latencyRange={latencyRange}
                onLatencyRangeChange={setLatencyRange}
                latencyMin={latencyBounds.min}
                latencyMax={latencyBounds.max}
                requestsRange={requestsRange}
                onRequestsRangeChange={setRequestsRange}
                requestsMin={requestsBounds.min}
                requestsMax={requestsBounds.max}
                renderMode="embedded"
                onTogglePanel={() =>
                  togglePanel('dependencies-filter-sidebar', { direction: 'left' })
                }
                disabled={isLoading}
              />
            </EuiResizablePanel>

            <EuiResizableButton />

            {/* Dependencies Table */}
            <EuiResizablePanel
              id="dependencies-main-content"
              initialSize={85}
              minSize="50%"
              paddingSize="none"
            >
              <EuiPanel>
                {!isLoading && filteredDependencies.length === 0 ? (
                  <EuiText color="subdued" textAlign="center">
                    <p>
                      {dependencies.length === 0
                        ? i18n.translate('observability.apm.dependencies.noData', {
                            defaultMessage:
                              'No dependencies found for this service in the selected time range.',
                          })
                        : i18n.translate('observability.apm.dependencies.noFilteredData', {
                            defaultMessage:
                              'No dependencies match the current filters. Try adjusting your filter criteria.',
                          })}
                    </p>
                  </EuiText>
                ) : (
                  <EuiInMemoryTable
                    key={`dependencies-table-${latencyPercentile}`}
                    items={isLoading ? [] : filteredDependencies}
                    columns={columns}
                    loading={isLoading}
                    sorting={{
                      sort: {
                        field: 'availability',
                        direction: 'asc',
                      },
                    }}
                    pagination={{
                      initialPageSize: SERVICE_DETAILS_CONSTANTS.DEFAULT_PAGE_SIZE,
                      pageSizeOptions: SERVICE_DETAILS_CONSTANTS.PAGE_SIZE_OPTIONS,
                    }}
                    itemId={(item) => `${item.serviceName}:${item.remoteOperation}`}
                    isExpandable={true}
                    itemIdToExpandedRowMap={itemIdToExpandedRowMap}
                    tableLayout="fixed"
                  />
                )}
              </EuiPanel>
            </EuiResizablePanel>
          </>
        )}
      </EuiResizableContainer>
    </div>
  );
};
