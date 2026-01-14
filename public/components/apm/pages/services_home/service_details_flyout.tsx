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
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButtonIcon,
  EuiCodeBlock,
  EuiEmptyPrompt,
} from '@elastic/eui';
import { CoreStart } from '../../../../../../../src/core/public';
import { DataPublicPluginStart } from '../../../../../../../src/plugins/data/public';
import { useApmConfig } from '../../config/apm_config_context';
import { useCorrelatedLogs } from '../../config/hooks';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { TimeRange } from '../../types/service_types';
import { parseTimeRange } from '../../shared/utils/time_utils';
import { servicesI18nTexts as i18nTexts } from './services_i18n';

interface ServiceDetailsFlyoutProps {
  serviceName: string;
  environment: string;
  timeRange: TimeRange;
  initialTab: 'spans' | 'logs';
  onClose: () => void;
  coreStart: CoreStart;
  dataService: DataPublicPluginStart;
}

interface SpanData {
  _id: string;
  startTime: string;
  status: number;
  httpStatus: number | string;
  kind: string;
  operation: string;
  spanId: string;
  raw: Record<string, any>;
}

interface LogData {
  _id: string;
  timestamp: string;
  level: string;
  message: string;
  spanId: string;
  raw: Record<string, any>;
}

interface LogDatasetResult {
  datasetId: string;
  displayName: string;
  logs: LogData[];
  loading: boolean;
  error?: Error;
}

/**
 * Format span kind for display - strips "SPAN_KIND_" prefix
 */
function formatSpanKind(kind: string | undefined): string {
  if (!kind) return '-';
  return kind.replace('SPAN_KIND_', '');
}

/**
 * Get status badge color based on status code
 */
function getStatusColor(statusCode: number): string {
  if (statusCode === 0) return 'success'; // OK
  if (statusCode === 2) return 'danger'; // ERROR
  return 'default'; // UNSET or unknown
}

/**
 * Get status label based on status code
 */
function getStatusLabel(statusCode: number): string {
  if (statusCode === 0) return 'OK';
  if (statusCode === 2) return 'ERROR';
  return 'UNSET';
}

/**
 * Get log level badge color
 */
function getLogLevelColor(level: string): string {
  const levelLower = (level || '').toLowerCase();
  if (levelLower === 'error' || levelLower === 'fatal') return 'danger';
  if (levelLower === 'warn' || levelLower === 'warning') return 'warning';
  if (levelLower === 'info') return 'primary';
  if (levelLower === 'debug' || levelLower === 'trace') return 'default';
  return 'hollow';
}

/**
 * Navigate to Discover with the given dataset and service filter
 */
function navigateToDiscover(datasetId: string, serviceName: string, timeRange: TimeRange): void {
  const discoverUrl = `/app/data-explorer/discover#?_a=(discover:(columns:!(_source),isDirty:!f,sort:!()),metadata:(indexPattern:'${datasetId}'))&_g=(filters:!(),query:(language:kuery,query:'serviceName:${serviceName}'),time:(from:'${timeRange.from}',to:'${timeRange.to}'))`;
  window.location.href = discoverUrl;
}

export const ServiceDetailsFlyout: React.FC<ServiceDetailsFlyoutProps> = ({
  serviceName,
  environment,
  timeRange,
  initialTab,
  onClose,
  coreStart,
  dataService,
}) => {
  const { config } = useApmConfig();
  const savedObjectsClient = coreStart.savedObjects.client;
  const traceDatasetId = config?.tracesDataset?.id;

  // Fetch correlated log datasets
  const { data: correlatedLogDatasets, loading: logsLoading } = useCorrelatedLogs(
    dataService,
    savedObjectsClient,
    traceDatasetId
  );

  // Spans state
  const [spans, setSpans] = useState<SpanData[]>([]);
  const [spansLoading, setSpansLoading] = useState(false);
  const [spansError, setSpansError] = useState<Error | null>(null);
  const [expandedSpanRows, setExpandedSpanRows] = useState<Record<string, React.ReactNode>>({});

  // Logs state - one entry per correlated dataset
  const [logResults, setLogResults] = useState<LogDatasetResult[]>([]);
  const [expandedLogRows, setExpandedLogRows] = useState<Record<string, React.ReactNode>>({});

  const parsedTimeRange = useMemo(() => parseTimeRange(timeRange), [timeRange]);

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
          coreStart.notifications.toasts.addDanger({
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
          const pplQuery = `source=${dataset.title} | where \`${serviceNameField}\` = '${serviceName}' | sort - \`${timestampField}\` | head 20`;
          const response = await pplService.executeQuery(pplQuery, datasetConfig);

          const logsData: LogData[] = (response.jsonData || []).map((item: any, idx: number) => ({
            _id: item.spanId || `log-${idx}`,
            timestamp: item[timestampField] || item.time || item['@timestamp'] || '',
            level: item.severityText || item.severity || item.level || '',
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
  }, [correlatedLogDatasets, coreStart, dataService, serviceName]);

  // Toggle span row expansion
  const toggleSpanRow = (spanId: string, rawData: Record<string, any>) => {
    setExpandedSpanRows((prev) => {
      const newExpanded = { ...prev };
      if (newExpanded[spanId]) {
        delete newExpanded[spanId];
      } else {
        newExpanded[spanId] = (
          <EuiCodeBlock language="json" paddingSize="s" overflowHeight={300}>
            {JSON.stringify(rawData, null, 2)}
          </EuiCodeBlock>
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
          <EuiCodeBlock language="json" paddingSize="s" overflowHeight={300}>
            {JSON.stringify(rawData, null, 2)}
          </EuiCodeBlock>
        );
      }
      return newExpanded;
    });
  };

  // Spans table columns
  const spanColumns: Array<EuiBasicTableColumn<SpanData>> = [
    {
      field: 'startTime',
      name: 'Time',
      width: '180px',
      render: (time: string) => (
        <EuiText size="xs">{time ? new Date(time).toLocaleString() : '-'}</EuiText>
      ),
    },
    {
      field: 'status',
      name: 'Status',
      width: '80px',
      render: (status: number) => (
        <EuiBadge color={getStatusColor(status)}>{getStatusLabel(status)}</EuiBadge>
      ),
    },
    {
      field: 'httpStatus',
      name: 'HTTP',
      width: '60px',
      render: (httpStatus: number | string) => <EuiText size="xs">{httpStatus}</EuiText>,
    },
    {
      field: 'kind',
      name: 'Kind',
      width: '80px',
      render: (kind: string) => <EuiText size="xs">{formatSpanKind(kind)}</EuiText>,
    },
    {
      field: 'operation',
      name: 'Operation',
      render: (operation: string) => (
        <EuiText size="xs" style={{ wordBreak: 'break-word' }}>
          {operation || '-'}
        </EuiText>
      ),
    },
    {
      field: 'spanId',
      name: 'Span ID',
      width: '140px',
      render: (spanId: string) => (
        <EuiText size="xs" style={{ fontFamily: 'monospace' }}>
          {spanId ? spanId.substring(0, 12) + '...' : '-'}
        </EuiText>
      ),
    },
    {
      name: '',
      width: '40px',
      render: (item: SpanData) => (
        <EuiButtonIcon
          onClick={() => toggleSpanRow(item._id, item.raw)}
          aria-label={expandedSpanRows[item._id] ? 'Collapse' : 'Expand'}
          iconType={expandedSpanRows[item._id] ? 'arrowDown' : 'arrowRight'}
        />
      ),
    },
  ];

  // Logs table columns
  const logColumns: Array<EuiBasicTableColumn<LogData>> = [
    {
      field: 'timestamp',
      name: 'Time',
      width: '180px',
      render: (time: string) => (
        <EuiText size="xs">{time ? new Date(time).toLocaleString() : '-'}</EuiText>
      ),
    },
    {
      field: 'level',
      name: 'Level',
      width: '80px',
      render: (level: string) => (
        <EuiBadge color={getLogLevelColor(level)}>{level || '-'}</EuiBadge>
      ),
    },
    {
      field: 'message',
      name: 'Message',
      render: (message: string) => (
        <EuiText size="xs" style={{ wordBreak: 'break-word' }}>
          {message ? (message.length > 200 ? message.substring(0, 200) + '...' : message) : '-'}
        </EuiText>
      ),
    },
    {
      field: 'spanId',
      name: 'Span ID',
      width: '140px',
      render: (spanId: string) => (
        <EuiText size="xs" style={{ fontFamily: 'monospace' }}>
          {spanId ? spanId.substring(0, 12) + '...' : '-'}
        </EuiText>
      ),
    },
    {
      name: '',
      width: '40px',
      render: (item: LogData) => (
        <EuiButtonIcon
          onClick={() => toggleLogRow(item._id, item.raw)}
          aria-label={expandedLogRows[item._id] ? 'Collapse' : 'Expand'}
          iconType={expandedLogRows[item._id] ? 'arrowDown' : 'arrowRight'}
        />
      ),
    },
  ];

  // Spans tab content
  const spansTabContent = (
    <>
      {spansLoading ? (
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '200px' }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : spansError ? (
        <EuiEmptyPrompt
          iconType="alert"
          title={<h3>Error loading spans</h3>}
          body={<p>{spansError.message}</p>}
        />
      ) : spans.length === 0 ? (
        <EuiEmptyPrompt iconType="search" title={<h3>{i18nTexts.flyout.noSpans}</h3>} />
      ) : (
        <EuiBasicTable
          items={spans}
          columns={spanColumns}
          itemId="_id"
          itemIdToExpandedRowMap={expandedSpanRows}
          isExpandable={true}
        />
      )}
    </>
  );

  // Logs tab content
  const logsTabContent = (
    <>
      {logsLoading ? (
        <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '200px' }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : !correlatedLogDatasets || correlatedLogDatasets.length === 0 ? (
        <EuiEmptyPrompt
          iconType="search"
          title={<h3>{i18nTexts.flyout.noCorrelatedLogs}</h3>}
          body={<p>Configure correlated log datasets in APM Settings.</p>}
        />
      ) : (
        <>
          {logResults.map((result, index) => (
            <React.Fragment key={result.datasetId}>
              {index > 0 && <EuiSpacer size="m" />}
              <EuiAccordion
                id={`log-dataset-${result.datasetId}`}
                initialIsOpen={index === 0}
                buttonContent={
                  <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiText size="s">
                        <strong>
                          {i18nTexts.flyout.dataset}: {result.displayName}
                        </strong>
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="hollow">
                        {result.loading ? '...' : result.logs.length} {i18nTexts.flyout.results}
                      </EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                }
                extraAction={
                  <EuiButton
                    size="s"
                    onClick={() => navigateToDiscover(result.datasetId, serviceName, timeRange)}
                  >
                    {i18nTexts.flyout.viewInDiscover}
                  </EuiButton>
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
                    Error: {result.error.message}
                  </EuiText>
                ) : result.logs.length === 0 ? (
                  <EuiText color="subdued" size="s">
                    {i18nTexts.flyout.noLogs}
                  </EuiText>
                ) : (
                  <EuiBasicTable
                    items={result.logs}
                    columns={logColumns}
                    itemId="_id"
                    itemIdToExpandedRowMap={expandedLogRows}
                    isExpandable={true}
                  />
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
      name: i18nTexts.flyout.tabSpans,
      content: (
        <>
          <EuiSpacer size="m" />
          {spansTabContent}
        </>
      ),
    },
    {
      id: 'logs',
      name: i18nTexts.flyout.tabLogs,
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
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2>{serviceName}</h2>
        </EuiTitle>
        <EuiText size="s" color="subdued">
          {environment}
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiTabbedContent
          tabs={tabs}
          initialSelectedTab={initialSelectedTab}
          autoFocus="selected"
        />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
