/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { ServiceTableItem } from '../../common/types/service_types';
import { DatasetConfig } from '../../common/types/apm_types';
import { useApmConfig } from '../../config/apm_config_context';

export interface UseServicesParams {
  startTime: Date;
  endTime: Date;
  environment?: string;
  refreshTrigger?: number;
}

export interface UseServicesResult {
  data: ServiceTableItem[];
  isLoading: boolean;
  error: Error | null;
  availableGroupByAttributes: Record<string, string[]>;
  refetch: () => void;
}

/**
 * Hook for fetching list of services using PPL
 *
 * Returns list of services with their basic metadata.
 *
 * @example
 * const { data, isLoading, error } = useServices({
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 *   queryIndex: 'otel-apm-service-map',
 * });
 */
export const useServices = (params: UseServicesParams): UseServicesResult => {
  const { config } = useApmConfig();
  const [data, setData] = useState<ServiceTableItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [availableGroupByAttributes, setAvailableGroupByAttributes] = useState<
    Record<string, string[]>
  >({});
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
      environment: params.environment,
      dataset: dataset!,
    }),
    [queryIndex, params.startTime, params.endTime, params.environment, dataset]
  );

  useEffect(() => {
    // Skip fetching if config is not ready
    if (!queryIndex || !dataset) {
      setData([]);
      setIsLoading(false);
      return;
    }

    const fetchServices = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await pplSearchService.listServices(fetchParams);

        // Response is now an object with ServiceSummaries and AvailableGroupByAttributes
        const availableAttributes = response.AvailableGroupByAttributes || {};
        setAvailableGroupByAttributes(availableAttributes);

        // Transform ServiceSummaries to ServiceTableItem[]
        const servicesList = response.ServiceSummaries || [];
        const services: ServiceTableItem[] = servicesList.map((svc: any) => {
          const serviceName = svc.KeyAttributes?.Name || svc.serviceName || svc.name || 'unknown';
          const environment = svc.KeyAttributes?.Environment || svc.environment || 'unknown';
          const groupByAttributes = svc.GroupByAttributes || {};

          return {
            serviceName,
            environment,
            groupByAttributes,
          };
        });

        setData(services);
      } catch (err) {
        console.error('[useServices] Error fetching services:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchServices();
  }, [pplSearchService, fetchParams, refetchTrigger, params.refreshTrigger, queryIndex, dataset]);

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return { data, isLoading, error, availableGroupByAttributes, refetch };
};
