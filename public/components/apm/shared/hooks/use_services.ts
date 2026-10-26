/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
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

  // Identity of the current request: a new object whenever the params or a
  // refetch trigger change. `data` is current only once the response for this
  // exact request has landed (loadedRequest === request).
  const request = useMemo(
    () => ({}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchParams, refetchTrigger, params.refreshTrigger, queryIndex, dataset]
  );
  const latestRequest = useRef(request);
  latestRequest.current = request;
  const [loadedRequest, setLoadedRequest] = useState<object | null>(null);

  useEffect(() => {
    // Skip fetching if config is not ready
    if (!queryIndex || !dataset) {
      setData([]);
      setIsLoading(false);
      setLoadedRequest(request);
      return;
    }

    const fetchServices = async () => {
      setIsLoading(true);
      setError(null);
      // A superseded request (e.g. the time range changed again mid-flight)
      // must not overwrite the newer request's results.
      const isCurrent = () => latestRequest.current === request;

      try {
        const response = await pplSearchService.listServices(fetchParams);
        if (!isCurrent()) return;

        // Response is now an object with ServiceSummaries and AvailableGroupByAttributes
        const availableAttributes = response.AvailableGroupByAttributes || {};
        setAvailableGroupByAttributes(availableAttributes);

        // Transform ServiceSummaries to ServiceTableItem[]
        const servicesList = response.ServiceSummaries || [];
        const services: ServiceTableItem[] = servicesList.map((svc: any) => {
          const serviceName = svc.KeyAttributes?.Name || svc.serviceName || svc.name || 'unknown';
          const environment = svc.KeyAttributes?.Environment || svc.environment || 'unknown';
          const groupByAttributes = svc.GroupByAttributes || {};
          // Lower-cased so sorting and filtering compare one form ('Service' is the legacy default).
          const type = String(svc.KeyAttributes?.Type || 'service').toLowerCase();

          return {
            serviceName,
            environment,
            groupByAttributes,
            type,
          };
        });

        setData(services);
      } catch (err) {
        if (!isCurrent()) return;
        console.error('[useServices] Error fetching services:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setData([]);
      }
      setLoadedRequest(request);
      setIsLoading(false);
    };

    fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  // Loading from the render the params change in, not only after the effect has
  // run: consumers keying further queries on `data` (e.g. per-service metrics)
  // can then wait for the list that matches the current time range instead of
  // querying with the previous range's list and re-querying when it lands.
  return {
    data,
    isLoading: isLoading || loadedRequest !== request,
    error,
    availableGroupByAttributes,
    refetch,
  };
};
