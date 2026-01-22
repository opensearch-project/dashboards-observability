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
  EuiFieldSearch,
  EuiSuperSelect,
  EuiToolTip,
  EuiIcon,
  EuiLink,
  EuiText,
  EuiResizableContainer,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TimeRange } from '../../common/types/service_details_types';
import { PromQLLineChart } from '../../shared/components/promql_line_chart';
import { SERVICE_DETAILS_CONSTANTS } from '../../common/constants';
import {
  getQueryOperationRequestsOverTime,
  getQueryOperationFaultsAndErrorsOverTime,
  getQueryOperationLatencyPercentilesOverTime,
} from '../../query_services/query_requests/promql_queries';
import { useOperations } from '../../shared/hooks/use_operations';
import { useOperationMetrics } from '../../shared/hooks/use_operation_metrics';
import { parseTimeRange } from '../../shared/utils/time_utils';
import { OperationFilterSidebar } from '../../shared/components/operation_filter_sidebar';
import { ActiveFilterBadges, FilterBadge } from '../../shared/components/active_filter_badges';
import { formatCount, formatLatency } from '../../common/format_utils';
import { navigateToServiceDetails } from '../../shared/utils/navigation_utils';
import { ServiceCorrelationsFlyout } from '../../shared/components/service_correlations_flyout';
import { useDebouncedValue } from '../../shared/hooks/use_debounced_value';

// Filter threshold constants
const AVAILABILITY_THRESHOLDS = ['< 95%', '95-99%', '≥ 99%'];
const ERROR_RATE_THRESHOLDS = ['< 1%', '1-5%', '> 5%'];

// Threshold matching functions
// Note: All values from PromQL are already in percentage (0-100) format
const matchesAvailabilityThreshold = (availability: number, threshold: string): boolean => {
  if (threshold === '< 95%') return availability < 95;
  if (threshold === '95-99%') return availability >= 95 && availability < 99;
  if (threshold === '≥ 99%') return availability >= 99;
  return false;
};

const matchesRateThreshold = (rate: number, threshold: string): boolean => {
  if (threshold === '< 1%') return rate < 1;
  if (threshold === '1-5%') return rate >= 1 && rate <= 5;
  if (threshold === '> 5%') return rate > 5;
  return false;
};

// Tooltip content for column headers
const tableTooltips = {
  latency: i18n.translate('observability.apm.operations.tooltip.latency', {
    defaultMessage: 'Response time at the selected percentile over the time range',
  }),
  requests: i18n.translate('observability.apm.operations.tooltip.requests', {
    defaultMessage: 'Total number of requests in the selected time range',
  }),
  errorRate: i18n.translate('observability.apm.operations.tooltip.errorRate', {
    defaultMessage: 'Percentage of requests with client errors (4xx)',
  }),
  availability: i18n.translate('observability.apm.operations.tooltip.availability', {
    defaultMessage: 'Percentage of successful requests (excludes 5xx server faults)',
  }),
  dependencies: i18n.translate('observability.apm.operations.tooltip.dependencies', {
    defaultMessage: 'Number of downstream dependencies called by this operation',
  }),
};

// Latency percentile options for EuiSuperSelect
const LATENCY_OPTIONS = [
  { value: 'p99', inputDisplay: 'P99' },
  { value: 'p90', inputDisplay: 'P90' },
  { value: 'p50', inputDisplay: 'P50' },
];

export interface ServiceOperationsProps {
  serviceName: string;
  environment?: string;
  timeRange: TimeRange;
  prometheusConnectionId: string;
  serviceMapDataset: string;
  refreshTrigger?: number;
}

interface OperationRow {
  operationName: string;
  requestCount: number;
  p50Duration: number;
  p90Duration: number;
  p99Duration: number;
  errorRate: number;
  availability: number;
  dependencyCount: number;
}

/**
 * ServiceOperations - Operations tab for service details
 *
 * Layout:
 * - Filter sidebar (left)
 * - Operations table (right) with expandable rows
 *
 * Table columns:
 * | Expand | Name | Latency (dynamic) | Requests | Error Rate | Availability |
 *
 * Expanded row content:
 * - 3 charts side-by-side: Requests & Availability, Faults & Errors, Latency Percentiles
 */
export const ServiceOperations: React.FC<ServiceOperationsProps> = ({
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

  // Filter sidebar state
  // Sidebar state is now managed by EuiResizableContainer
  const [selectedOperations, setSelectedOperations] = useState<string[]>([]);

  // Threshold filter states
  const [selectedAvailabilityThresholds, setSelectedAvailabilityThresholds] = useState<string[]>(
    []
  );
  const [selectedErrorRateThresholds, setSelectedErrorRateThresholds] = useState<string[]>([]);

  // Range filter states
  const [latencyRange, setLatencyRange] = useState<[number, number]>([0, 10000]);
  const [requestsRange, setRequestsRange] = useState<[number, number]>([0, 100000]);

  // Search and latency selector states
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 150);
  const [latencyPercentile, setLatencyPercentile] = useState<'p99' | 'p90' | 'p50'>('p99');

  // Flyout state for viewing correlated spans/logs
  const [flyoutState, setFlyoutState] = useState<{
    isOpen: boolean;
    operationName: string | null;
    initialTab: 'spans' | 'logs';
  }>({ isOpen: false, operationName: null, initialTab: 'spans' });

  const openCorrelationsFlyout = useCallback((operationName: string, tab: 'spans' | 'logs') => {
    setFlyoutState({ isOpen: true, operationName, initialTab: tab });
  }, []);

  const closeFlyout = useCallback(() => {
    setFlyoutState({ isOpen: false, operationName: null, initialTab: 'spans' });
  }, []);

  // Parse time range
  const parsedTimeRange = useMemo(() => {
    try {
      return parseTimeRange(timeRange);
    } catch (e) {
      console.error('[ServiceOperations] Failed to parse time range:', e);
      return {
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(),
      };
    }
  }, [timeRange]);

  // Fetch operations list from PPL
  const { data: operationsData, isLoading: opsLoading, error: opsError } = useOperations({
    serviceName,
    environment,
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    refreshTrigger,
  });

  // Fetch Prometheus metrics for operations
  const { metrics: operationMetrics, isLoading: metricsLoading } = useOperationMetrics({
    operations: operationsData || [],
    serviceName,
    environment: environment || 'generic:default',
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    prometheusConnectionId,
    refreshTrigger,
  });

  // Merge operations with metrics
  const operations: OperationRow[] = useMemo(() => {
    if (!operationsData) return [];
    return operationsData.map((op) => {
      const metrics = operationMetrics.get(op.operationName);
      return {
        operationName: op.operationName,
        requestCount: metrics?.requestCount ?? 0, // Use Prometheus request count
        p50Duration: metrics?.p50Duration ?? 0,
        p90Duration: metrics?.p90Duration ?? 0,
        p99Duration: metrics?.p99Duration ?? 0,
        errorRate: metrics?.errorRate ?? 0,
        availability: metrics?.availability ?? 0,
        dependencyCount: op.dependencyCount ?? 0,
      };
    });
  }, [operationsData, operationMetrics]);

  // Extract operation names for filter sidebar
  const operationNames = useMemo(() => {
    return operations.map((op) => op.operationName);
  }, [operations]);

  // Step 1: Apply text/category filters (before metric filters)
  // These are used to compute dynamic bounds for sliders
  const textFilteredOperations = useMemo(() => {
    return operations.filter((op) => {
      // Search query filter (using debounced value for performance)
      if (debouncedSearchQuery.trim()) {
        const query = debouncedSearchQuery.toLowerCase().trim();
        if (!op.operationName.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Operation name filter (if any operations selected from sidebar)
      if (selectedOperations.length > 0 && !selectedOperations.includes(op.operationName)) {
        return false;
      }

      // Availability threshold filter (OR logic - pass if matches ANY selected threshold)
      if (selectedAvailabilityThresholds.length > 0) {
        const matchesAny = selectedAvailabilityThresholds.some((threshold) =>
          matchesAvailabilityThreshold(op.availability, threshold)
        );
        if (!matchesAny) return false;
      }

      // Error rate threshold filter (OR logic)
      if (selectedErrorRateThresholds.length > 0) {
        const matchesAny = selectedErrorRateThresholds.some((threshold) =>
          matchesRateThreshold(op.errorRate, threshold)
        );
        if (!matchesAny) return false;
      }

      return true;
    });
  }, [
    operations,
    debouncedSearchQuery,
    selectedOperations,
    selectedAvailabilityThresholds,
    selectedErrorRateThresholds,
  ]);

  // Step 2: Calculate min/max bounds from text-filtered data
  // Use the selected percentile's duration for bounds calculation
  const latencyBounds = useMemo(() => {
    if (textFilteredOperations.length === 0) return { min: 0, max: 10000 };
    const latencies = textFilteredOperations.map((op) => {
      if (latencyPercentile === 'p99') return op.p99Duration;
      if (latencyPercentile === 'p90') return op.p90Duration;
      return op.p50Duration;
    });
    const min = Math.floor(Math.min(...latencies));
    const max = Math.ceil(Math.max(...latencies)) || 10000;
    return { min, max: Math.max(max, min + 1) };
  }, [textFilteredOperations, latencyPercentile]);

  const requestsBounds = useMemo(() => {
    if (textFilteredOperations.length === 0) return { min: 0, max: 100000 };
    const requests = textFilteredOperations.map((op) => op.requestCount);
    const min = Math.floor(Math.min(...requests));
    const max = Math.ceil(Math.max(...requests)) || 100000;
    return { min, max: Math.max(max, min + 1) };
  }, [textFilteredOperations]);

  // Step 3: Reset slider ranges when bounds change
  // Use functional update to prevent unnecessary re-renders when values haven't changed
  useEffect(() => {
    setLatencyRange((prev) => {
      if (prev[0] === latencyBounds.min && prev[1] === latencyBounds.max) {
        return prev; // Return same reference to avoid re-render
      }
      return [latencyBounds.min, latencyBounds.max];
    });
  }, [latencyBounds.min, latencyBounds.max]);

  useEffect(() => {
    setRequestsRange((prev) => {
      if (prev[0] === requestsBounds.min && prev[1] === requestsBounds.max) {
        return prev; // Return same reference to avoid re-render
      }
      return [requestsBounds.min, requestsBounds.max];
    });
  }, [requestsBounds.min, requestsBounds.max]);

  // Cleanup expanded rows when operations list changes to remove stale entries
  useEffect(() => {
    if (operations.length === 0) return;
    const currentOpNames = new Set(operations.map((op) => op.operationName));
    setExpandedRows((prev) => {
      const cleaned = new Set([...prev].filter((name) => currentOpNames.has(name)));
      return cleaned.size === prev.size ? prev : cleaned;
    });
  }, [operations]);

  // Step 4: Apply metric filters (latency, requests ranges) on top of text-filtered data
  const filteredOperations = useMemo(() => {
    return textFilteredOperations.filter((op) => {
      // Latency range filter (only if range has been adjusted)
      const isLatencyFilterActive =
        latencyRange[0] > latencyBounds.min || latencyRange[1] < latencyBounds.max;
      if (isLatencyFilterActive) {
        // Use the selected percentile's duration for filtering
        const opLatency =
          latencyPercentile === 'p99'
            ? op.p99Duration
            : latencyPercentile === 'p90'
            ? op.p90Duration
            : op.p50Duration;
        if (opLatency < latencyRange[0] || opLatency > latencyRange[1]) {
          return false;
        }
      }

      // Requests range filter (only if range has been adjusted)
      const isRequestsFilterActive =
        requestsRange[0] > requestsBounds.min || requestsRange[1] < requestsBounds.max;
      if (isRequestsFilterActive) {
        if (op.requestCount < requestsRange[0] || op.requestCount > requestsRange[1]) {
          return false;
        }
      }

      return true;
    });
  }, [
    textFilteredOperations,
    latencyRange,
    requestsRange,
    latencyBounds,
    requestsBounds,
    latencyPercentile,
  ]);

  const isLoading = opsLoading || metricsLoading;
  const error = opsError;

  // Build active filter badges from current filter state
  const activeFilters: FilterBadge[] = useMemo(() => {
    const badges: FilterBadge[] = [];

    // Operations filter badge
    if (selectedOperations.length > 0) {
      badges.push({
        key: 'operations',
        category: i18n.translate('observability.apm.operations.filterCategory.operations', {
          defaultMessage: 'Operation',
        }),
        values: selectedOperations,
        onRemove: () => setSelectedOperations([]),
      });
    }

    // Availability threshold badges
    if (selectedAvailabilityThresholds.length > 0) {
      badges.push({
        key: 'availability',
        category: i18n.translate('observability.apm.operations.filterCategory.availability', {
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
        category: i18n.translate('observability.apm.operations.filterCategory.errorRate', {
          defaultMessage: 'Error rate',
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
        category: i18n.translate('observability.apm.operations.filterCategory.latency', {
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
        category: i18n.translate('observability.apm.operations.filterCategory.requests', {
          defaultMessage: 'Requests',
        }),
        values: [`${requestsRange[0].toFixed(0)}-${requestsRange[1].toFixed(0)}`],
        onRemove: () => setRequestsRange([requestsBounds.min, requestsBounds.max]),
      });
    }

    return badges;
  }, [
    selectedOperations,
    selectedAvailabilityThresholds,
    selectedErrorRateThresholds,
    latencyRange,
    requestsRange,
    latencyBounds,
    requestsBounds,
  ]);

  // Clear all filters handler
  const handleClearAllFilters = useCallback(() => {
    setSelectedOperations([]);
    setSelectedAvailabilityThresholds([]);
    setSelectedErrorRateThresholds([]);
    setLatencyRange([latencyBounds.min, latencyBounds.max]);
    setRequestsRange([requestsBounds.min, requestsBounds.max]);
  }, [latencyBounds, requestsBounds]);

  // Auto-expand the first row (lowest availability) on initial page load
  useEffect(() => {
    if (hasAutoExpandedRef.current || filteredOperations.length === 0 || isLoading) {
      return;
    }

    // Find item with minimum availability (matches table sort: availability asc)
    const lowestAvailItem = filteredOperations.reduce((min, curr) => {
      const minAvail = min.availability ?? Infinity;
      const currAvail = curr.availability ?? Infinity;
      return currAvail < minAvail ? curr : min;
    });

    setExpandedRows(new Set([lowestAvailItem.operationName]));
    hasAutoExpandedRef.current = true;
  }, [filteredOperations, isLoading]);

  // Toggle expand/collapse for a row
  const toggleRowExpand = useCallback((operationName: string) => {
    setExpandedRows((current) => {
      const newSet = new Set(current);
      if (newSet.has(operationName)) {
        newSet.delete(operationName);
      } else {
        newSet.add(operationName);
      }
      return newSet;
    });
  }, []);

  // Note: rate values from PromQL are already in percentage (0-100) format
  const formatRate = (rate: number, operation: OperationRow): React.ReactNode => {
    // Show '-' if no data (no requests)
    if (rate === undefined || isNaN(rate) || operation.requestCount === 0) return '-';
    const percentage = rate.toFixed(2);
    const color = rate === 0 ? 'success' : rate > 5 ? 'danger' : rate > 1 ? 'warning' : 'success';
    return (
      <EuiToolTip content="< 1% = Healthy, 1-5% = Degraded, > 5% = Critical">
        <EuiHealth color={color}>{percentage}%</EuiHealth>
      </EuiToolTip>
    );
  };

  // Note: availability values from PromQL are already in percentage (0-100) format
  const formatAvailability = (avail: number, operation: OperationRow): React.ReactNode => {
    // Show '-' if no data (no requests)
    if (avail === undefined || isNaN(avail) || operation.requestCount === 0) return '-';
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
  const columns: Array<EuiBasicTableColumn<OperationRow>> = useMemo(
    () => [
      {
        name: '',
        width: '40px',
        render: (operation: OperationRow) => (
          <EuiButtonIcon
            onClick={() => toggleRowExpand(operation.operationName)}
            iconType={
              expandedRowsRef.current.has(operation.operationName) ? 'arrowDown' : 'arrowRight'
            }
            aria-label={
              expandedRowsRef.current.has(operation.operationName) ? 'Collapse' : 'Expand'
            }
          />
        ),
      },
      {
        field: 'operationName',
        name: i18n.translate('observability.apm.operations.name', { defaultMessage: 'Operation' }),
        sortable: true,
        truncateText: true,
        render: (name: string) => <strong>{name}</strong>,
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
              {i18n.translate('observability.apm.operations.latency', {
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
        render: formatLatency,
      },
      {
        field: 'requestCount',
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              {i18n.translate('observability.apm.operations.requests', {
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
        render: (count: number) => formatCount(count),
      },
      {
        field: 'errorRate',
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              {i18n.translate('observability.apm.operations.errorRate', {
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
        render: (rate: number, operation: OperationRow) => formatRate(rate, operation),
      },
      {
        field: 'availability',
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              {i18n.translate('observability.apm.operations.availability', {
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
        render: (avail: number, operation: OperationRow) => formatAvailability(avail, operation),
      },
      {
        field: 'dependencyCount',
        name: (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              {i18n.translate('observability.apm.operations.dependencies', {
                defaultMessage: 'Dependencies',
              })}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={tableTooltips.dependencies}>
                <EuiIcon type="questionInCircle" size="s" color="subdued" />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        sortable: true,
        render: (count: number, operation: OperationRow) => {
          if (count === 0 || count === undefined) return '-';
          return (
            <EuiLink
              onClick={() => {
                // Navigate to dependencies tab with operation filter in URL
                navigateToServiceDetails(serviceName, environment || 'default', {
                  tab: 'dependencies',
                  operation: operation.operationName,
                });
              }}
            >
              {count}
            </EuiLink>
          );
        },
      },
      {
        name: i18n.translate('observability.apm.operations.actions', {
          defaultMessage: 'Actions',
        }),
        width: '100px',
        render: (operation: OperationRow) => (
          <EuiFlexGroup gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={i18n.translate('observability.apm.operations.viewSpans', {
                  defaultMessage: 'View correlated spans',
                })}
              >
                <EuiButtonIcon
                  iconType="apmTrace"
                  aria-label="View spans"
                  onClick={() => openCorrelationsFlyout(operation.operationName, 'spans')}
                />
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={i18n.translate('observability.apm.operations.viewLogs', {
                  defaultMessage: 'View associated logs',
                })}
              >
                <EuiButtonIcon
                  iconType="discoverApp"
                  aria-label="View logs"
                  onClick={() => openCorrelationsFlyout(operation.operationName, 'logs')}
                />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
      },
    ],
    [toggleRowExpand, latencyPercentile, serviceName, environment, openCorrelationsFlyout]
  );

  // Create expanded row content
  const itemIdToExpandedRowMap = useMemo(() => {
    const map: Record<string, React.ReactNode> = {};

    expandedRows.forEach((operationName) => {
      map[operationName] = (
        <EuiPanel color="subdued" paddingSize="m">
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="m">
            <EuiFlexItem>
              <PromQLLineChart
                title="Requests"
                promqlQuery={getQueryOperationRequestsOverTime(
                  environment,
                  serviceName,
                  operationName
                )}
                prometheusConnectionId={prometheusConnectionId}
                timeRange={timeRange}
                height={SERVICE_DETAILS_CONSTANTS.EXPANDED_ROW_CHART_HEIGHT}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <PromQLLineChart
                title="Faults and Errors"
                promqlQuery={getQueryOperationFaultsAndErrorsOverTime(
                  environment,
                  serviceName,
                  operationName
                )}
                prometheusConnectionId={prometheusConnectionId}
                timeRange={timeRange}
                height={SERVICE_DETAILS_CONSTANTS.EXPANDED_ROW_CHART_HEIGHT}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <PromQLLineChart
                title="Latency (p50, p90, p99)"
                promqlQuery={getQueryOperationLatencyPercentilesOverTime(
                  environment,
                  serviceName,
                  operationName
                )}
                prometheusConnectionId={prometheusConnectionId}
                timeRange={timeRange}
                height={SERVICE_DETAILS_CONSTANTS.EXPANDED_ROW_CHART_HEIGHT}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      );
    });

    return map;
  }, [expandedRows, environment, serviceName, timeRange, prometheusConnectionId]);

  if (error) {
    return (
      <EuiCallOut
        title={i18n.translate('observability.apm.operations.error', {
          defaultMessage: 'Error loading operations',
        })}
        color="danger"
        iconType="alert"
      >
        <p>{(error as Error).message}</p>
      </EuiCallOut>
    );
  }

  return (
    <div data-test-subj="serviceOperations">
      <EuiSpacer size="m" />

      {/* Search bar and latency selector - at top */}
      <EuiFlexGroup gutterSize="m" alignItems="center">
        <EuiFlexItem>
          <EuiFieldSearch
            placeholder={i18n.translate('observability.apm.operations.searchPlaceholder', {
              defaultMessage: 'Filter operations...',
            })}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            isClearable
            fullWidth
            compressed
            disabled={isLoading}
            data-test-subj="operationsSearchBar"
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
            data-test-subj="latencyPercentileSelector"
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

      {/* Sidebar + Table layout with resizable container */}
      <EuiResizableContainer>
        {(EuiResizablePanel, EuiResizableButton, { togglePanel }) => (
          <>
            {/* Filter Sidebar - Resizable */}
            <EuiResizablePanel
              id="operations-filter-sidebar"
              initialSize={15}
              minSize="10%"
              mode={['custom', { position: 'top' }]}
              paddingSize="none"
              style={{ paddingRight: '8px' }}
            >
              <OperationFilterSidebar
                availabilityThresholds={AVAILABILITY_THRESHOLDS}
                selectedAvailabilityThresholds={selectedAvailabilityThresholds}
                onAvailabilityThresholdsChange={setSelectedAvailabilityThresholds}
                errorRateThresholds={ERROR_RATE_THRESHOLDS}
                selectedErrorRateThresholds={selectedErrorRateThresholds}
                onErrorRateThresholdsChange={setSelectedErrorRateThresholds}
                operationNames={operationNames}
                selectedOperations={selectedOperations}
                onOperationChange={setSelectedOperations}
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
                  togglePanel('operations-filter-sidebar', { direction: 'left' })
                }
                disabled={isLoading}
              />
            </EuiResizablePanel>

            <EuiResizableButton />

            {/* Operations Table */}
            <EuiResizablePanel
              id="operations-main-content"
              initialSize={85}
              minSize="50%"
              paddingSize="none"
              style={{ paddingLeft: '8px' }}
            >
              <EuiPanel>
                {!isLoading && filteredOperations.length === 0 ? (
                  <EuiText color="subdued" textAlign="center">
                    <p>
                      {operations.length === 0
                        ? i18n.translate('observability.apm.operations.noData', {
                            defaultMessage:
                              'No operations found for this service in the selected time range.',
                          })
                        : i18n.translate('observability.apm.operations.noFilteredData', {
                            defaultMessage:
                              'No operations match the current filters. Try adjusting your filter criteria.',
                          })}
                    </p>
                  </EuiText>
                ) : (
                  <EuiInMemoryTable
                    key={`operations-table-${latencyPercentile}`}
                    items={isLoading ? [] : filteredOperations}
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
                    itemId="operationName"
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

      {/* Correlations flyout for viewing spans/logs filtered by operation */}
      {flyoutState.isOpen && flyoutState.operationName && (
        <ServiceCorrelationsFlyout
          serviceName={serviceName}
          environment={environment}
          timeRange={timeRange}
          initialTab={flyoutState.initialTab}
          onClose={closeFlyout}
          operationFilter={flyoutState.operationName}
        />
      )}
    </div>
  );
};
