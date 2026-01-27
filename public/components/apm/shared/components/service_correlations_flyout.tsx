/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiTitle,
  EuiTabbedContent,
  EuiTabbedContentTab,
  EuiLoadingSpinner,
  EuiText,
  EuiSpacer,
  EuiAccordion,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButtonIcon,
  EuiCodeBlock,
  EuiEmptyPrompt,
  EuiSuperSelect,
  EuiLink,
  EuiIcon,
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
} from '@elastic/eui';
import moment from 'moment';
import { coreRefs } from '../../../../framework/core_refs';
import { useApmConfig } from '../../config/apm_config_context';
import { useCorrelatedLogs } from '../hooks/use_apm_config';
import { useServiceAttributes } from '../hooks/use_service_attributes';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { TimeRange } from '../../common/types/service_types';
import { parseTimeRange } from '../utils/time_utils';
import { correlationsFlyoutI18nTexts as i18nTexts } from './service_correlations_flyout_i18n';
import {
  navigateToExploreTraces,
  navigateToSpanDetails,
  navigateToExploreLogs,
  navigateToDatasetCorrelations,
} from '../utils/navigation_utils';
import {
  getEnvironmentDisplayName,
  APM_CONSTANTS,
  CORRELATION_CONSTANTS,
} from '../../common/constants';
import { uiSettingsService } from '../../../../../common/utils';
import { SpanData, LogData, LogDatasetResult } from '../../common/types/correlations_types';
import { LanguageIcon } from './language_icon';
import {
  formatSpanKind,
  getStatusColor,
  getStatusLabel,
  getLogLevelColor,
  getHttpStatusColor,
  normalizeLogLevel,
} from '../utils/format_utils';

/**
 * Creates a toggle handler for expanding/collapsing table rows with raw JSON data.
 */
const createToggleRowHandler = (
  setExpandedRows: React.Dispatch<React.SetStateAction<Record<string, React.ReactNode>>>
) => (id: string, rawData: Record<string, any>) => {
  setExpandedRows((prev) => {
    const newExpanded = { ...prev };
    if (newExpanded[id]) {
      delete newExpanded[id];
    } else {
      newExpanded[id] = (
        <div style={{ width: '100%' }}>
          <EuiCodeBlock language="json" paddingSize="s" overflowHeight={300} isCopyable>
            {JSON.stringify(rawData, null, 2)}
          </EuiCodeBlock>
        </div>
      );
    }
    return newExpanded;
  });
};

interface ServiceCorrelationsFlyoutProps {
  serviceName: string;
  environment: string;
  language?: string;
  timeRange: TimeRange;
  initialTab: 'spans' | 'logs' | 'attributes';
  onClose: () => void;
  /** Optional: Filter spans by operation name (for operations table) */
  operationFilter?: string;
}

export const ServiceCorrelationsFlyout: React.FC<ServiceCorrelationsFlyoutProps> = ({
  serviceName,
  environment,
  language,
  timeRange,
  initialTab,
  onClose,
  operationFilter,
}) => {
  // Check if any filters are active (used for conditionally hiding Attributes tab and showing filter badge)
  const hasFilters = Boolean(operationFilter);
  const { config } = useApmConfig();
  const traceDatasetId = config?.tracesDataset?.id;

  // Fetch correlated log datasets using coreRefs
  const { data: correlatedLogDatasets, loading: logsLoading } = useCorrelatedLogs(traceDatasetId);

  // Spans state
  const [spans, setSpans] = useState<SpanData[]>([]);
  const [spansLoading, setSpansLoading] = useState(false);
  const [spansError, setSpansError] = useState<Error | null>(null);
  const [expandedSpanRows, setExpandedSpanRows] = useState<Record<string, React.ReactNode>>({});

  // Logs state - one entry per correlated dataset
  const [logResults, setLogResults] = useState<LogDatasetResult[]>([]);
  const [expandedLogRows, setExpandedLogRows] = useState<Record<string, React.ReactNode>>({});

  // Status filter state
  const [statusFilter, setStatusFilter] = useState('all');

  // Log level filter state
  const [logLevelFilter, setLogLevelFilter] = useState('all');

  // Sorting state for spans table
  const [spanSortField, setSpanSortField] = useState<keyof SpanData>('startTime');
  const [spanSortDirection, setSpanSortDirection] = useState<'asc' | 'desc'>('desc');

  // Sorting state for logs table
  const [logSortField, setLogSortField] = useState<keyof LogData>('timestamp');
  const [logSortDirection, setLogSortDirection] = useState<'asc' | 'desc'>('desc');

  // State for tracking open accordions (keyed by datasetId)
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});

  // State for tracking selected tab
  const [selectedTabId, setSelectedTabId] = useState<string>(initialTab);

  // Initialize first accordion as open when log results load
  useEffect(() => {
    if (logResults.length > 0 && Object.keys(openAccordions).length === 0) {
      setOpenAccordions({ [logResults[0].datasetId]: true });
    }
  }, [logResults, openAccordions]);

  // Toggle accordion open/close
  const toggleAccordion = (datasetId: string) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [datasetId]: !prev[datasetId],
    }));
  };

  const parsedTimeRange = useMemo(() => parseTimeRange(timeRange), [timeRange]);

  // Fetch service attributes for the Attributes tab
  const {
    attributes: serviceAttributes,
    isLoading: attributesLoading,
    error: attributesError,
  } = useServiceAttributes({
    serviceName,
    environment,
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
  });

  // Filter options for status/HTTP status filter
  // Status codes use badges, HTTP codes use colored text matching table display
  const filterOptions = [
    { value: 'all', inputDisplay: i18nTexts.filterAll },
    {
      value: 'unset',
      inputDisplay: <EuiBadge color="default">UNSET</EuiBadge>,
    },
    {
      value: 'error',
      inputDisplay: <EuiBadge color="danger">ERROR</EuiBadge>,
    },
    {
      value: 'ok',
      inputDisplay: <EuiBadge color="success">OK</EuiBadge>,
    },
    {
      value: 'http-2xx',
      inputDisplay: (
        <EuiText size="s" color="success">
          <strong>2xx</strong>
        </EuiText>
      ),
    },
    {
      value: 'http-3xx',
      inputDisplay: (
        <EuiText size="s" color="accent">
          <strong>3xx</strong>
        </EuiText>
      ),
    },
    {
      value: 'http-4xx',
      inputDisplay: (
        <EuiText size="s" color="warning">
          <strong>4xx</strong>
        </EuiText>
      ),
    },
    {
      value: 'http-5xx',
      inputDisplay: (
        <EuiText size="s" color="danger">
          <strong>5xx</strong>
        </EuiText>
      ),
    },
  ];

  // Log level filter options
  const logFilterOptions = [
    { value: 'all', inputDisplay: i18nTexts.filterAll },
    { value: 'fatal', inputDisplay: <EuiBadge color="danger">FATAL</EuiBadge> },
    { value: 'error', inputDisplay: <EuiBadge color="danger">ERROR</EuiBadge> },
    { value: 'warn', inputDisplay: <EuiBadge color="warning">WARN</EuiBadge> },
    { value: 'info', inputDisplay: <EuiBadge color="primary">INFO</EuiBadge> },
    { value: 'debug', inputDisplay: <EuiBadge color="default">DEBUG</EuiBadge> },
    { value: 'trace', inputDisplay: <EuiBadge color="hollow">TRACE</EuiBadge> },
  ];

  // Filter and sort spans based on selection
  const filteredSpans = useMemo(() => {
    let filtered = spans;
    if (statusFilter === 'unset') filtered = spans.filter((s) => s.status !== 0 && s.status !== 2);
    else if (statusFilter === 'error') filtered = spans.filter((s) => s.status === 2);
    else if (statusFilter === 'ok') filtered = spans.filter((s) => s.status === 0);
    else if (statusFilter === 'http-2xx')
      filtered = spans.filter((s) => Number(s.httpStatus) >= 200 && Number(s.httpStatus) < 300);
    else if (statusFilter === 'http-3xx')
      filtered = spans.filter((s) => Number(s.httpStatus) >= 300 && Number(s.httpStatus) < 400);
    else if (statusFilter === 'http-4xx')
      filtered = spans.filter((s) => Number(s.httpStatus) >= 400 && Number(s.httpStatus) < 500);
    else if (statusFilter === 'http-5xx')
      filtered = spans.filter((s) => Number(s.httpStatus) >= 500);

    // Sort the filtered results
    return [...filtered].sort((a, b) => {
      const aValue = a[spanSortField];
      const bValue = b[spanSortField];
      if (aValue < bValue) return spanSortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return spanSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [spans, statusFilter, spanSortField, spanSortDirection]);

  // State for traceIds extracted from spans (used for log correlation)
  const [extractedTraceIds, setExtractedTraceIds] = useState<string[]>([]);
  const [spanTimeRange, setSpanTimeRange] = useState<{ minTime: Date; maxTime: Date } | undefined>(
    undefined
  );

  // Fetch spans with optional filters
  useEffect(() => {
    if (!config?.tracesDataset) return;

    const fetchSpans = async () => {
      setSpansLoading(true);
      setSpansError(null);

      try {
        const pplService = new PPLSearchService();
        const dataset = {
          id: config.tracesDataset!.id,
          title: config.tracesDataset!.title,
          dataSource: config.tracesDataset!.datasourceId
            ? { id: config.tracesDataset!.datasourceId }
            : undefined,
        };

        // Build PPL query with optional filters
        let pplQuery = `source=${dataset.title} | where serviceName = '${serviceName}'`;

        // Add operation filter if specified
        if (operationFilter) {
          pplQuery += ` | where name = '${operationFilter}'`;
        }

        pplQuery += ` | sort - startTime | head 50`;
        const response = await pplService.executeQuery(pplQuery, dataset);

        const spansData: SpanData[] = (response.jsonData || []).map((item: any, idx: number) => ({
          _id: item.spanId || `span-${idx}`,
          startTime: item.startTime || '',
          status: item.status?.code ?? item['status.code'] ?? 0,
          httpStatus:
            item.attributes?.http?.status_code ||
            item['attributes.http.status_code'] ||
            item.attributes?.['http.response.status_code'] ||
            '-',
          kind: item.kind || '',
          operation: item.name || '',
          spanId: item.spanId || '',
          raw: item,
        }));

        setSpans(spansData);

        // Extract unique traceIds for log correlation
        const traceIds = [
          ...new Set(
            spansData.map((span) => span.raw.traceId).filter((id): id is string => Boolean(id))
          ),
        ];
        setExtractedTraceIds(traceIds);

        // Calculate time range from spans for log query buffer
        if (spansData.length > 0) {
          const timestamps = spansData
            .map((span) => {
              // Span timestamps are UTC but without 'Z' suffix - append 'Z' to parse as UTC
              const timestamp = span.startTime.endsWith('Z')
                ? span.startTime
                : span.startTime + 'Z';
              return new Date(timestamp).getTime();
            })
            .filter((t) => !isNaN(t));
          if (timestamps.length > 0) {
            setSpanTimeRange({
              minTime: new Date(Math.min(...timestamps)),
              maxTime: new Date(Math.max(...timestamps)),
            });
          }
        }
      } catch (err) {
        setSpansError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setSpansLoading(false);
      }
    };

    fetchSpans();
  }, [config?.tracesDataset, serviceName, parsedTimeRange, operationFilter]);

  // Fetch logs for each correlated dataset using traceId correlation
  useEffect(() => {
    if (!correlatedLogDatasets || correlatedLogDatasets.length === 0) {
      setLogResults([]);
      return;
    }

    // Wait for spans to load first so we have traceIds
    if (spansLoading) {
      return;
    }

    const fetchLogsForDatasets = async () => {
      // Initialize results with loading state
      const initialResults: LogDatasetResult[] = correlatedLogDatasets.map((dataset) => ({
        datasetId: dataset.id,
        displayName: dataset.displayName,
        title: dataset.title,
        serviceNameField: dataset.schemaMappings?.serviceName || '',
        traceIdField: dataset.schemaMappings?.traceId || 'traceId',
        logs: [],
        loading: true,
        dataSourceId: dataset.dataSourceId,
        dataSourceTitle: dataset.dataSourceTitle,
      }));
      setLogResults(initialResults);

      // Fetch logs for all datasets in parallel
      const pplService = new PPLSearchService();

      const fetchPromises = correlatedLogDatasets.map(async (dataset, index) => {
        // Validate schema mappings exist with required fields
        if (!dataset.schemaMappings?.serviceName || !dataset.schemaMappings?.timestamp) {
          coreRefs.toasts?.addDanger({
            title: `Missing schema mappings for ${dataset.displayName}`,
            text:
              'The log dataset is missing required schema mappings (serviceName, timestamp). Please configure the dataset properly.',
          });
          return {
            index,
            result: {
              datasetId: dataset.id,
              displayName: dataset.displayName || dataset.title,
              title: dataset.title,
              serviceNameField: '',
              traceIdField: dataset.schemaMappings?.traceId || 'traceId',
              logs: [],
              loading: false,
              error: new Error('Missing schema mappings'),
              dataSourceId: dataset.dataSourceId,
              dataSourceTitle: dataset.dataSourceTitle,
            },
          };
        }

        const serviceNameField = dataset.schemaMappings.serviceName;
        const timestampField = dataset.schemaMappings.timestamp;
        const traceIdFieldValue = dataset.schemaMappings?.traceId || 'traceId';

        try {
          const datasetConfig = {
            id: dataset.id,
            title: dataset.title,
          };

          // Build PPL query with traceId correlation and fallback
          let pplQuery = `source=${dataset.title}`;

          // 1. Always filter by serviceName
          pplQuery += ` | where \`${serviceNameField}\` = '${serviceName}'`;

          // 2. Add timestamp filter with buffer if we have span time range (5 minutes on each side)
          if (spanTimeRange) {
            const bufferMs = CORRELATION_CONSTANTS.TELEMETRY_LAG_BUFFER_MS;
            const minTimeStr = new Date(spanTimeRange.minTime.getTime() - bufferMs).toISOString();
            const maxTimeStr = new Date(spanTimeRange.maxTime.getTime() + bufferMs).toISOString();
            pplQuery += ` | where \`${timestampField}\` >= '${minTimeStr}' AND \`${timestampField}\` <= '${maxTimeStr}'`;
          }

          // 3. Add traceId correlation only when viewing filtered data (operations/dependencies)
          // When no filters are set (service-level view), show all logs for the service
          // Note: PPL uses isnull() function, not IS NULL syntax
          if (hasFilters && extractedTraceIds.length > 0) {
            const traceIdList = extractedTraceIds.map((id) => `'${id}'`).join(', ');
            pplQuery += ` | where (\`${traceIdFieldValue}\` IN (${traceIdList}) OR \`${traceIdFieldValue}\` = '' OR isnull(\`${traceIdFieldValue}\`))`;
          }

          pplQuery += ` | sort - \`${timestampField}\` | head 10`;
          const response = await pplService.executeQuery(pplQuery, datasetConfig);

          const logsData: LogData[] = (response.jsonData || []).map((item: any, idx: number) => ({
            _id: `${dataset.id}-${idx}`,
            timestamp: item[timestampField] || item.time || item['@timestamp'] || '',
            level: item.severityText || item.severity || item.level || '',
            severityNumber: item.severityNumber || item['severity.number'] || undefined,
            message: item.body || item.message || '',
            spanId: item.spanId || '',
            raw: item,
          }));

          return {
            index,
            result: {
              datasetId: dataset.id,
              displayName: dataset.displayName || dataset.title,
              title: dataset.title,
              serviceNameField,
              traceIdField: traceIdFieldValue,
              logs: logsData,
              loading: false,
              dataSourceId: dataset.dataSourceId,
              dataSourceTitle: dataset.dataSourceTitle,
            },
          };
        } catch (err) {
          return {
            index,
            result: {
              datasetId: dataset.id,
              displayName: dataset.displayName || dataset.title,
              title: dataset.title,
              serviceNameField,
              traceIdField: traceIdFieldValue,
              logs: [],
              loading: false,
              error: err instanceof Error ? err : new Error(String(err)),
              dataSourceId: dataset.dataSourceId,
              dataSourceTitle: dataset.dataSourceTitle,
            },
          };
        }
      });

      // Wait for all fetches to complete and update state once
      const fetchedResults = await Promise.all(fetchPromises);
      const finalResults = [...initialResults];
      fetchedResults.forEach(({ index, result }) => {
        finalResults[index] = result;
      });
      setLogResults(finalResults);
    };

    fetchLogsForDatasets();
  }, [
    correlatedLogDatasets,
    serviceName,
    extractedTraceIds,
    spanTimeRange,
    spansLoading,
    hasFilters,
  ]);

  // Toggle row expansion handlers using shared factory function
  const toggleSpanRow = createToggleRowHandler(setExpandedSpanRows);
  const toggleLogRow = createToggleRowHandler(setExpandedLogRows);

  // Spans table columns
  const spanColumns: Array<EuiBasicTableColumn<SpanData>> = [
    {
      name: '',
      width: '40px',
      render: (item: SpanData) => (
        <EuiButtonIcon
          onClick={() => toggleSpanRow(item._id, item.raw)}
          aria-label={expandedSpanRows[item._id] ? i18nTexts.collapse : i18nTexts.expand}
          iconType={expandedSpanRows[item._id] ? 'arrowDown' : 'arrowRight'}
        />
      ),
    },
    {
      field: 'startTime',
      name: i18nTexts.columnTime,
      width: '200px',
      sortable: true,
      render: (time: string) => {
        if (!time) return <EuiText size="xs">-</EuiText>;
        const dateFormat = uiSettingsService.get('dateFormat') || 'MMM D, YYYY @ HH:mm:ss.SSS';
        return <EuiText size="xs">{moment(time).format(dateFormat)}</EuiText>;
      },
    },
    {
      field: 'status',
      name: i18nTexts.columnStatus,
      width: '100px',
      sortable: true,
      render: (status: number) => (
        <EuiBadge color={getStatusColor(status)}>{getStatusLabel(status)}</EuiBadge>
      ),
    },
    {
      field: 'httpStatus',
      name: i18nTexts.columnHttpStatus,
      width: '100px',
      sortable: true,
      render: (httpStatus: number | string) => (
        <EuiText size="xs" color={getHttpStatusColor(httpStatus)}>
          <strong>{httpStatus}</strong>
        </EuiText>
      ),
    },
    {
      field: 'kind',
      name: i18nTexts.columnKind,
      width: '100px',
      sortable: true,
      render: (kind: string) => <EuiText size="xs">{formatSpanKind(kind)}</EuiText>,
    },
    {
      field: 'operation',
      name: i18nTexts.columnOperation,
      sortable: true,
      render: (operation: string) => (
        <EuiText size="xs" style={{ wordBreak: 'break-word' }}>
          {operation || '-'}
        </EuiText>
      ),
    },
    {
      field: 'spanId',
      name: i18nTexts.columnSpanId,
      width: '200px',
      render: (spanId: string, item: SpanData) =>
        spanId ? (
          <EuiLink
            onClick={() =>
              navigateToSpanDetails(
                config?.tracesDataset?.id || '',
                config?.tracesDataset?.title || '',
                spanId,
                item.raw.traceId || '',
                config?.tracesDataset?.datasourceId,
                config?.tracesDataset?.datasourceTitle
              )
            }
            style={{ fontFamily: 'monospace', fontSize: '12px' }}
          >
            {spanId} <EuiIcon type="popout" size="s" />
          </EuiLink>
        ) : (
          <EuiText size="xs">-</EuiText>
        ),
    },
  ];

  // Logs table columns
  const logColumns: Array<EuiBasicTableColumn<LogData>> = [
    {
      name: '',
      width: '40px',
      render: (item: LogData) => (
        <EuiButtonIcon
          onClick={() => toggleLogRow(item._id, item.raw)}
          aria-label={expandedLogRows[item._id] ? i18nTexts.collapse : i18nTexts.expand}
          iconType={expandedLogRows[item._id] ? 'arrowDown' : 'arrowRight'}
        />
      ),
    },
    {
      field: 'timestamp',
      name: i18nTexts.columnTime,
      width: '200px',
      sortable: true,
      render: (time: string) => {
        if (!time) return <EuiText size="xs">-</EuiText>;
        const dateFormat = uiSettingsService.get('dateFormat') || 'MMM D, YYYY @ HH:mm:ss.SSS';
        return <EuiText size="xs">{moment(time).format(dateFormat)}</EuiText>;
      },
    },
    {
      field: 'level',
      name: i18nTexts.columnLevel,
      width: '100px',
      sortable: true,
      render: (level: string) => (
        <EuiBadge color={getLogLevelColor(level)}>{level || '-'}</EuiBadge>
      ),
    },
    {
      field: 'message',
      name: i18nTexts.columnMessage,
      sortable: true,
      render: (message: string) => (
        <EuiText size="xs" style={{ wordBreak: 'break-word' }}>
          {message
            ? message.length > APM_CONSTANTS.MESSAGE_TRUNCATION_LENGTH
              ? message.substring(0, APM_CONSTANTS.MESSAGE_TRUNCATION_LENGTH) + '...'
              : message
            : '-'}
        </EuiText>
      ),
    },
    {
      field: 'spanId',
      name: i18nTexts.columnSpanId,
      width: '200px',
      render: (spanId: string, item: LogData) =>
        spanId ? (
          <EuiLink
            onClick={() =>
              navigateToSpanDetails(
                config?.tracesDataset?.id || '',
                config?.tracesDataset?.title || '',
                spanId,
                item.raw.traceId || '',
                config?.tracesDataset?.datasourceId,
                config?.tracesDataset?.datasourceTitle
              )
            }
            style={{ fontFamily: 'monospace', fontSize: '12px' }}
          >
            {spanId} <EuiIcon type="popout" size="s" />
          </EuiLink>
        ) : (
          <EuiText size="xs">-</EuiText>
        ),
    },
  ];

  // Spans tab content
  const spansTabContent = (
    <>
      {/* Header row with dataset title, filter, and explore button */}
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <strong>
              {i18nTexts.dataset}: {config?.tracesDataset?.title || i18nTexts.traces}
            </strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiSuperSelect
                options={filterOptions}
                valueOfSelected={statusFilter}
                onChange={(value) => setStatusFilter(value)}
                compressed
                prepend={<EuiIcon type="filter" />}
                style={{ minWidth: 100 }}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                iconType="popout"
                iconSide="right"
                size="s"
                disabled={!spansLoading && spans.length === 0}
                onClick={() =>
                  navigateToExploreTraces(
                    config?.tracesDataset?.id || '',
                    config?.tracesDataset?.title || '',
                    serviceName,
                    timeRange,
                    config?.tracesDataset?.datasourceId,
                    undefined, // dataSourceTitle - not available in config
                    operationFilter // Pass the operation filter
                  )
                }
              >
                {i18nTexts.exploreTraces}
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiText size="xs" color="subdued">
        {i18nTexts.spansDescription}
      </EuiText>
      <EuiSpacer size="m" />

      {spansLoading ? (
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '200px' }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : spansError ? (
        <EuiEmptyPrompt
          iconType="alert"
          title={<h3>{i18nTexts.errorLoadingSpans}</h3>}
          body={<p>{spansError.message}</p>}
        />
      ) : filteredSpans.length === 0 ? (
        <EuiEmptyPrompt iconType="search" title={<h3>{i18nTexts.noSpans}</h3>} />
      ) : (
        <EuiBasicTable
          items={filteredSpans}
          columns={spanColumns}
          itemId="_id"
          itemIdToExpandedRowMap={expandedSpanRows}
          isExpandable={true}
          sorting={{
            sort: {
              field: spanSortField,
              direction: spanSortDirection,
            },
          }}
          onChange={({ sort }) => {
            if (sort) {
              setSpanSortField(sort.field as keyof SpanData);
              setSpanSortDirection(sort.direction);
            }
          }}
        />
      )}
    </>
  );

  // Logs tab content
  const logsTabContent = (
    <>
      {/* Header row with description and filter */}
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem>
          <EuiText size="xs" color="subdued">
            {i18nTexts.logsDescription}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSuperSelect
            options={logFilterOptions}
            valueOfSelected={logLevelFilter}
            onChange={(value) => setLogLevelFilter(value)}
            compressed
            prepend={<EuiIcon type="filter" />}
            style={{ minWidth: 100 }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />

      {logsLoading ? (
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '200px' }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : !correlatedLogDatasets || correlatedLogDatasets.length === 0 ? (
        <EuiEmptyPrompt
          iconType="search"
          title={<h3>{i18nTexts.noCorrelatedLogs}</h3>}
          body={<p>{i18nTexts.noCorrelatedLogsBody}</p>}
          actions={
            traceDatasetId && (
              <EuiButton
                fill
                onClick={() => navigateToDatasetCorrelations(traceDatasetId)}
                iconType="gear"
              >
                {i18nTexts.setupCorrelations}
              </EuiButton>
            )
          }
        />
      ) : (
        <>
          {logResults.map((result, index) => (
            <React.Fragment key={result.datasetId}>
              {index > 0 && <EuiSpacer size="m" />}
              <EuiAccordion
                id={`log-dataset-${result.datasetId}`}
                forceState={openAccordions[result.datasetId] ? 'open' : 'closed'}
                onToggle={() => toggleAccordion(result.datasetId)}
                buttonContent={
                  <EuiText size="s">
                    <strong>
                      {i18nTexts.dataset}: {result.displayName}
                    </strong>
                  </EuiText>
                }
                extraAction={
                  <EuiButtonEmpty
                    size="s"
                    iconType="popout"
                    iconSide="right"
                    disabled={!result.loading && result.logs.length === 0}
                    onClick={() =>
                      navigateToExploreLogs(
                        result.datasetId,
                        result.title,
                        serviceName,
                        result.serviceNameField,
                        timeRange,
                        result.dataSourceId,
                        result.dataSourceTitle,
                        hasFilters ? extractedTraceIds : undefined, // Pass traceIds only when filtered
                        hasFilters ? result.traceIdField : undefined // Pass traceIdField
                      )
                    }
                  >
                    {i18nTexts.exploreLogs}
                  </EuiButtonEmpty>
                }
              >
                <EuiSpacer size="s" />
                {result.loading ? (
                  <EuiFlexGroup justifyContent="center">
                    <EuiFlexItem grow={false}>
                      <EuiLoadingSpinner size="m" />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                ) : result.error ? (
                  <EuiText color="danger" size="s">
                    {i18nTexts.errorPrefix}: {result.error.message}
                  </EuiText>
                ) : (
                  (() => {
                    // Filter and sort logs
                    const filteredLogs = result.logs
                      .filter((log) => {
                        if (logLevelFilter === 'all') return true;
                        return normalizeLogLevel(log.level, log.severityNumber) === logLevelFilter;
                      })
                      .sort((a, b) => {
                        const aValue = a[logSortField];
                        const bValue = b[logSortField];
                        if (aValue < bValue) return logSortDirection === 'asc' ? -1 : 1;
                        if (aValue > bValue) return logSortDirection === 'asc' ? 1 : -1;
                        return 0;
                      });

                    return filteredLogs.length === 0 ? (
                      <EuiText color="subdued" size="s">
                        {i18nTexts.noLogs}
                      </EuiText>
                    ) : (
                      <EuiBasicTable
                        items={filteredLogs}
                        columns={logColumns}
                        itemId="_id"
                        itemIdToExpandedRowMap={expandedLogRows}
                        isExpandable={true}
                        sorting={{
                          sort: {
                            field: logSortField,
                            direction: logSortDirection,
                          },
                        }}
                        onChange={({ sort }) => {
                          if (sort) {
                            setLogSortField(sort.field as keyof LogData);
                            setLogSortDirection(sort.direction);
                          }
                        }}
                      />
                    );
                  })()
                )}
              </EuiAccordion>
            </React.Fragment>
          ))}
        </>
      )}
    </>
  );

  // Attributes tab content
  const attributesTabContent = (
    <>
      <EuiText size="xs" color="subdued">
        {i18nTexts.attributesDescription}
      </EuiText>
      <EuiSpacer size="m" />

      {attributesLoading ? (
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '200px' }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : attributesError ? (
        <EuiEmptyPrompt
          iconType="alert"
          title={<h3>{i18nTexts.errorPrefix}</h3>}
          body={<p>{attributesError.message}</p>}
        />
      ) : Object.keys(serviceAttributes).length === 0 ? (
        <EuiEmptyPrompt iconType="search" title={<h3>{i18nTexts.noAttributes}</h3>} />
      ) : (
        <>
          {/* Environment */}
          <EuiDescriptionList>
            <EuiDescriptionListTitle>{i18nTexts.environment}</EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              <EuiBadge color="hollow">{getEnvironmentDisplayName(environment)}</EuiBadge>
            </EuiDescriptionListDescription>
          </EuiDescriptionList>

          <EuiSpacer size="m" />

          {/* Attributes */}
          <EuiText size="s">
            <strong>{i18nTexts.attributes}</strong>
          </EuiText>
          <EuiSpacer size="s" />
          <EuiDescriptionList compressed>
            {Object.entries(serviceAttributes).map(([key, value]) => (
              <React.Fragment key={key}>
                <EuiDescriptionListTitle>{key}</EuiDescriptionListTitle>
                <EuiDescriptionListDescription>{value}</EuiDescriptionListDescription>
              </React.Fragment>
            ))}
          </EuiDescriptionList>
        </>
      )}
    </>
  );

  // Build filter badge text for display
  const filterBadgeText = useMemo(() => {
    if (operationFilter) {
      return `${i18nTexts.filterBadgeOperation}: ${operationFilter}`;
    }
    return null;
  }, [operationFilter]);

  // Build tabs - conditionally include Attributes tab based on filters
  const tabs: EuiTabbedContentTab[] = useMemo(() => {
    const tabList: EuiTabbedContentTab[] = [];

    // Only include Attributes tab when no filters are set (service-level view)
    if (!hasFilters) {
      tabList.push({
        id: 'attributes',
        name: (
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon
                type="navServices"
                color={selectedTabId === 'attributes' ? 'primary' : 'inherit'}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>{i18nTexts.tabAttributes}</EuiFlexItem>
          </EuiFlexGroup>
        ),
        content: (
          <>
            <EuiSpacer size="m" />
            {attributesTabContent}
          </>
        ),
      });
    }

    // Always include Spans tab
    tabList.push({
      id: 'spans',
      name: (
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="apmTrace" color={selectedTabId === 'spans' ? 'primary' : 'inherit'} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>{i18nTexts.tabSpans}</EuiFlexItem>
        </EuiFlexGroup>
      ),
      content: (
        <>
          <EuiSpacer size="m" />
          {spansTabContent}
        </>
      ),
    });

    // Always include Logs tab
    tabList.push({
      id: 'logs',
      name: (
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="discoverApp" color={selectedTabId === 'logs' ? 'primary' : 'inherit'} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>{i18nTexts.tabLogs}</EuiFlexItem>
        </EuiFlexGroup>
      ),
      content: (
        <>
          <EuiSpacer size="m" />
          {logsTabContent}
        </>
      ),
    });

    return tabList;
  }, [hasFilters, selectedTabId, attributesTabContent, spansTabContent, logsTabContent]);

  const initialSelectedTab = tabs.find((tab) => tab.id === initialTab) || tabs[0];

  return (
    <EuiFlyout onClose={onClose} size="l" ownFocus>
      <EuiFlyoutHeader hasBorder={false}>
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <LanguageIcon language={language} size="l" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiTitle size="m">
              <h2>{serviceName}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{getEnvironmentDisplayName(environment)}</EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>
        {/* Filter badge - shown only when operation or dependency filters are active */}
        {filterBadgeText && (
          <>
            <EuiSpacer size="s" />
            <EuiBadge color="primary" iconType="filter">
              {filterBadgeText}
            </EuiBadge>
          </>
        )}
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiTabbedContent
          tabs={tabs}
          initialSelectedTab={initialSelectedTab}
          onTabClick={(tab) => setSelectedTabId(tab.id)}
        />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
