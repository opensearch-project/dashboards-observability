/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { ServiceOperation } from '../../common/types/service_details_types';
import { DatasetConfig } from '../../common/types/apm_types';
import { useApmConfig } from '../../config/apm_config_context';

export interface UseOperationsParams {
  serviceName: string;
  environment?: string;
  startTime: Date;
  endTime: Date;
  refreshTrigger?: number;
}

export interface UseOperationsResult {
  data: ServiceOperation[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for fetching service operations using PPL
 *
 * Returns a list of operations (endpoints/methods) for a service.
 * Metrics (latency, error rate, etc.) are fetched separately via useOperationMetrics hook.
 *
 * @example
 * const { data, isLoading, error } = useOperations({
 *   serviceName: 'payment-service',
 *   environment: 'production',
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 * });
 */
export const useOperations = (params: UseOperationsParams): UseOperationsResult => {
  const { config } = useApmConfig();
  const [data, setData] = useState<ServiceOperation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Get config values
  const serviceMapDataset = config?.serviceMapDataset;
  const queryIndex = serviceMapDataset?.title || '';

  // Build dataset config from APM config
  const dataset: DatasetConfig | undefined = useMemo(() => {
    if (!serviceMapDataset) return undefined;
    return {
      id: serviceMapDataset.id,
      title: serviceMapDataset.title,
      ...(serviceMapDataset.datasourceId && {
        dataSource: {
          id: serviceMapDataset.datasourceId,
          type: 'DATA_SOURCE',
        },
      }),
    };
  }, [serviceMapDataset]);

  const pplSearchService = useMemo(() => new PPLSearchService(), []);

  const fetchParams = useMemo(
    () => ({
      queryIndex,
      startTime: params.startTime,
      endTime: params.endTime,
      keyAttributes: {
        Name: params.serviceName,
        Environment: params.environment || 'unknown',
      },
      dataset: dataset!,
    }),
    [queryIndex, params.startTime, params.endTime, params.serviceName, params.environment, dataset]
  );

  useEffect(() => {
    // Skip fetching if config is not ready
    if (!queryIndex || !dataset) {
      setData([]);
      setIsLoading(false);
      return;
    }

    const fetchOperations = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await pplSearchService.listServiceOperations(fetchParams);

        // Response structure: { Operations: [...], StartTime, EndTime, NextToken }
        const operationsArray = response.Operations || [];
        const operations: ServiceOperation[] = operationsArray.map((op: any) => ({
          operationName: op.Name || 'unknown',
          requestCount: parseInt(op.Count, 10) || 0,
          // Metrics will be populated by useOperationMetrics hook
          errorRate: 0,
          faultRate: 0,
          avgDuration: 0,
          p50Duration: 0,
          p90Duration: 0,
          p99Duration: 0,
          availability: 0,
          dependencyCount: op.DependencyCount || 0,
        }));

        setData(operations);
      } catch (err) {
        console.error('[useOperations] Error fetching operations:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOperations();
  }, [pplSearchService, fetchParams, refetchTrigger, params.refreshTrigger, queryIndex, dataset]);

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return { data, isLoading, error, refetch };
};
