/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { ServiceDependency, GroupedDependency } from '../../common/types/service_details_types';
import { DatasetConfig } from '../../common/types/apm_types';
import { useApmConfig } from '../../config/apm_config_context';

export interface UseDependenciesParams {
  serviceName: string;
  environment?: string;
  startTime: Date;
  endTime: Date;
  refreshTrigger?: number;
}

export interface UseDependenciesResult {
  data: ServiceDependency[];
  groupedData: GroupedDependency[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for fetching service dependencies using PPL
 *
 * Returns upstream and downstream service dependencies.
 * Metrics (latency, error rate, etc.) are fetched separately via useDependencyMetrics hook.
 *
 * @example
 * const { data, groupedData, isLoading, error } = useDependencies({
 *   serviceName: 'payment-service',
 *   environment: 'production',
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 * });
 */
export const useDependencies = (params: UseDependenciesParams): UseDependenciesResult => {
  const { config } = useApmConfig();
  const [data, setData] = useState<ServiceDependency[]>([]);
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

    const fetchDependencies = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await pplSearchService.listServiceDependencies(fetchParams);

        // Response structure: { Dependencies: [...], StartTime, EndTime, NextToken }
        const responseDeps = response.Dependencies || [];

        // Transform response to ServiceDependency[]
        const dependencies: ServiceDependency[] = responseDeps.map((dep: any) => ({
          serviceName: dep.DependencyName || dep.serviceName || dep.targetService || 'unknown',
          environment: dep.Environment || dep.environment || 'generic:default',
          serviceOperation: dep.ServiceOperation || dep.serviceOperation || 'unknown',
          remoteOperation: dep.RemoteOperation || dep.remoteOperation || 'unknown',
          callCount: parseInt(dep.CallCount || dep.callCount, 10) || 0,
        }));

        setData(dependencies);
      } catch (err) {
        console.error('[useDependencies] Error fetching dependencies:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDependencies();
  }, [pplSearchService, fetchParams, refetchTrigger, params.refreshTrigger, queryIndex, dataset]);

  // Group dependencies by (serviceName + remoteOperation) for table display
  const groupedData = useMemo(() => {
    const groupMap = new Map<string, GroupedDependency>();

    data.forEach((dep) => {
      const key = `${dep.serviceName}:${dep.remoteOperation}`;

      if (groupMap.has(key)) {
        const existing = groupMap.get(key)!;
        existing.callCount += dep.callCount;
        if (!existing.serviceOperations.includes(dep.serviceOperation)) {
          existing.serviceOperations.push(dep.serviceOperation);
        }
      } else {
        groupMap.set(key, {
          serviceName: dep.serviceName,
          environment: dep.environment,
          remoteOperation: dep.remoteOperation,
          serviceOperations: [dep.serviceOperation],
          callCount: dep.callCount,
          // Metrics will be populated by useDependencyMetrics hook
          p50Duration: undefined,
          p90Duration: undefined,
          p99Duration: undefined,
          faultRate: undefined,
          errorRate: undefined,
          availability: undefined,
        });
      }
    });

    return Array.from(groupMap.values());
  }, [data]);

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return { data, groupedData, isLoading, error, refetch };
};
