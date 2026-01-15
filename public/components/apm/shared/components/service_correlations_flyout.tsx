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
} from '@elastic/eui';
import moment from 'moment';
import { coreRefs } from '../../../../framework/core_refs';
import { useApmConfig } from '../../config/apm_config_context';
import { useCorrelatedLogs } from '../hooks/use_apm_config';
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
import { getEnvironmentDisplayName } from '../../common/constants';
import { uiSettingsService } from '../../../../../common/utils';
import { SpanData, LogData, LogDatasetResult } from '../types/correlations_types';
import { LanguageIcon } from './language_icon';
import {
  formatSpanKind,
  getStatusColor,
  getStatusLabel,
  getLogLevelColor,
  getHttpStatusColor,
  normalizeLogLevel,
} from '../utils/format_utils';

interface ServiceCorrelationsFlyoutProps {
  serviceName: string;
  environment: string;
  language?: string;
  timeRange: TimeRange;
  initialTab: 'spans' | 'logs';
  onClose: () => void;
}

export const ServiceCorrelationsFlyout: React.FC<ServiceCorrelationsFlyoutProps> = ({
  serviceName,
  environment,
  language,
  timeRange,
  initialTab,
  onClose,
}) => {
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

  // Fetch spans
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

        const pplQuery = `source=${dataset.title} | where serviceName = '${serviceName}' | sort - startTime | head 50`;
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
      } catch (err) {
        setSpansError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setSpansLoading(false);
      }
    };

    fetchSpans();
  }, [config?.tracesDataset, serviceName, parsedTimeRange]);

  // Fetch logs for each correlated dataset
  useEffect(() => {
    if (!correlatedLogDatasets || correlatedLogDatasets.length === 0) {
      setLogResults([]);
      return;
    }

    const fetchLogsForDatasets = async () => {
      const results: LogDatasetResult[] = [];

      for (const dataset of correlatedLogDatasets) {
        const result: LogDatasetResult = {
          datasetId: dataset.id,
          displayName: dataset.displayName,
          title: dataset.title,
          serviceNameField: dataset.schemaMappings?.serviceName || '',
          logs: [],
          loading: true,
        };
        results.push(result);
      }
      setLogResults([...results]);

      // Fetch logs for each dataset
      const pplService = new PPLSearchService();

      for (let i = 0; i < correlatedLogDatasets.length; i++) {
        const dataset = correlatedLogDatasets[i];

        // Validate schema mappings exist with required fields
        if (!dataset.schemaMappings?.serviceName || !dataset.schemaMappings?.timestamp) {
          coreRefs.toasts?.addDanger({
            title: `Missing schema mappings for ${dataset.displayName}`,
            text:
              'The log dataset is missing required schema mappings (serviceName, timestamp). Please configure the dataset properly.',
          });
          results[i] = {
            ...results[i],
            loading: false,
            error: new Error('Missing schema mappings'),
          };
          setLogResults([...results]);
          continue;
        }

        const serviceNameField = dataset.schemaMappings.serviceName;
        const timestampField = dataset.schemaMappings.timestamp;

        try {
          const datasetConfig = {
            id: dataset.id,
            title: dataset.title,
          };

          // Use backticks for field names with dots
          const pplQuery = `source=${dataset.title} | where \`${serviceNameField}\` = '${serviceName}' | sort - \`${timestampField}\` | head 10`;
          const response = await pplService.executeQuery(pplQuery, datasetConfig);

          const logsData: LogData[] = (response.jsonData || []).map((item: any, idx: number) => ({
            _id: `${dataset.id}-${idx}`, // Use dataset ID + index for unique row ID
            timestamp: item[timestampField] || item.time || item['@timestamp'] || '',
            level: item.severityText || item.severity || item.level || '',
            severityNumber: item.severityNumber || item['severity.number'] || undefined,
            message: item.body || item.message || '',
            spanId: item.spanId || '',
            raw: item,
          }));

          results[i] = {
            ...results[i],
            logs: logsData,
            loading: false,
          };
        } catch (err) {
          results[i] = {
            ...results[i],
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          };
        }
        setLogResults([...results]);
      }
    };

    fetchLogsForDatasets();
  }, [correlatedLogDatasets, serviceName]);

  // Toggle span row expansion
  const toggleSpanRow = (spanId: string, rawData: Record<string, any>) => {
    setExpandedSpanRows((prev) => {
      const newExpanded = { ...prev };
      if (newExpanded[spanId]) {
        delete newExpanded[spanId];
      } else {
        newExpanded[spanId] = (
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

  // Toggle log row expansion
  const toggleLogRow = (logId: string, rawData: Record<string, any>) => {
    setExpandedLogRows((prev) => {
      const newExpanded = { ...prev };
      if (newExpanded[logId]) {
        delete newExpanded[logId];
      } else {
        newExpanded[logId] = (
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
                undefined // dataSourceTitle - not available in config
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
          {message ? (message.length > 200 ? message.substring(0, 200) + '...' : message) : '-'}
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
                undefined
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
                onClick={() =>
                  navigateToExploreTraces(
                    config?.tracesDataset?.id || '',
                    config?.tracesDataset?.title || '',
                    serviceName,
                    timeRange,
                    config?.tracesDataset?.datasourceId,
                    undefined // dataSourceTitle - not available in config
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
                    onClick={() =>
                      navigateToExploreLogs(
                        result.datasetId,
                        result.title,
                        serviceName,
                        result.serviceNameField,
                        timeRange
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

  const tabs: EuiTabbedContentTab[] = [
    {
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
    },
    {
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
    },
  ];

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
