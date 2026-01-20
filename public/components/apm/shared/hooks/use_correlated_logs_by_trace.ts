/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { coreRefs } from '../../../../framework/core_refs';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { CorrelatedLogDataset } from './use_apm_config';
import { LogData, LogDatasetResult } from '../../common/types/correlations_types';
import { CORRELATION_CONSTANTS } from '../../common/constants';

interface UseCorrelatedLogsByTraceOptions {
  /** TraceIds extracted from filtered spans */
  traceIds: string[];
  /** Correlated log datasets to query */
  logDatasets: CorrelatedLogDataset[];
  /** Service name for fallback filtering */
  serviceName: string;
  /** Time range from spans for temporal filtering */
  spanTimeRange?: {
    minTime: Date;
    maxTime: Date;
  };
  /** Whether to fetch logs (enables/disables the hook) */
  enabled: boolean;
}

/**
 * Hook for fetching logs correlated via traceIds.
 *
 * Uses a hybrid query approach:
 * 1. Filters by serviceName (ensures logs belong to the right service)
 * 2. Filters by timestamp with buffer (temporal relevance)
 * 3. Filters by traceId IN (...) OR traceId = '' OR traceId IS NULL (correlation with fallback)
 *
 * This handles cases where logs don't have traceId populated due to ingestion issues.
 */
export const useCorrelatedLogsByTrace = ({
  traceIds,
  logDatasets,
  serviceName,
  spanTimeRange,
  enabled,
}: UseCorrelatedLogsByTraceOptions) => {
  const [logResults, setLogResults] = useState<LogDatasetResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Calculate time range with buffer (5 minutes on each side)
  const timeRangeWithBuffer = useMemo(() => {
    if (!spanTimeRange) return null;
    const bufferMs = CORRELATION_CONSTANTS.TELEMETRY_LAG_BUFFER_MS;
    return {
      minTime: new Date(spanTimeRange.minTime.getTime() - bufferMs),
      maxTime: new Date(spanTimeRange.maxTime.getTime() + bufferMs),
    };
  }, [spanTimeRange]);

  useEffect(() => {
    if (!enabled || logDatasets.length === 0) {
      setLogResults([]);
      return;
    }

    const fetchLogsForDatasets = async () => {
      setIsLoading(true);
      setError(null);

      // Initialize results for all datasets
      const results: LogDatasetResult[] = logDatasets.map((dataset) => ({
        datasetId: dataset.id,
        displayName: dataset.displayName,
        title: dataset.title,
        serviceNameField: dataset.schemaMappings?.serviceName || '',
        logs: [],
        loading: true,
      }));
      setLogResults([...results]);

      const pplService = new PPLSearchService();

      for (let i = 0; i < logDatasets.length; i++) {
        const dataset = logDatasets[i];

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
        const traceIdField = dataset.schemaMappings?.traceId || 'traceId';

        try {
          const datasetConfig = {
            id: dataset.id,
            title: dataset.title,
          };

          // Build the PPL query with hybrid filtering
          let pplQuery = `source=${dataset.title}`;

          // 1. Always filter by serviceName
          pplQuery += ` | where \`${serviceNameField}\` = '${serviceName}'`;

          // 2. Add timestamp filter with buffer if we have span time range
          if (timeRangeWithBuffer) {
            const minTimeStr = timeRangeWithBuffer.minTime.toISOString();
            const maxTimeStr = timeRangeWithBuffer.maxTime.toISOString();
            pplQuery += ` | where \`${timestampField}\` >= '${minTimeStr}' AND \`${timestampField}\` <= '${maxTimeStr}'`;
          }

          // 3. Add traceId correlation with fallback for empty/null traceIds
          // Note: PPL uses isnull() function, not IS NULL syntax
          if (traceIds.length > 0) {
            const traceIdList = traceIds.map((id) => `'${id}'`).join(', ');
            pplQuery += ` | where (\`${traceIdField}\` IN (${traceIdList}) OR \`${traceIdField}\` = '' OR isnull(\`${traceIdField}\`))`;
          }

          // Sort by timestamp descending and limit
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

      setIsLoading(false);
    };

    fetchLogsForDatasets();
  }, [enabled, traceIds, logDatasets, serviceName, timeRangeWithBuffer]);

  return {
    logResults,
    isLoading,
    error,
  };
};
