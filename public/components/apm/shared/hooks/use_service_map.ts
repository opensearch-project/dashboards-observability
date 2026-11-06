/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { DatasetConfig } from '../../common/types/apm_types';
import { useApmConfig } from '../../config/apm_config_context';
import {
  ServiceMapNode,
  ServiceMapEdge,
  ServiceMapResponse,
} from '../../common/types/service_map_types';

export interface UseServiceMapParams {
  startTime: Date;
  endTime: Date;
  refreshTrigger?: number;
  /** When false nothing is fetched (a large map loads as an overview instead). */
  enabled?: boolean;
}

export interface UseServiceMapResult {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
  isLoading: boolean;
  error: Error | null;
  availableGroupByAttributes: Record<string, string[]>;
  /** True when the edge query hit its row cap, so the topology is incomplete. */
  truncated: boolean;
  refetch: () => void;
}

/**
 * Hook for fetching service map topology data using PPL
 *
 * Returns nodes and edges for the service topology visualization.
 * Uses the existing PPLSearchService.getServiceMap() method.
 *
 * @example
 * const { nodes, edges, isLoading, error } = useServiceMap({
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 * });
 */
export const useServiceMap = (params: UseServiceMapParams): UseServiceMapResult => {
  const { config } = useApmConfig();
  const [nodes, setNodes] = useState<ServiceMapNode[]>([]);
  const [edges, setEdges] = useState<ServiceMapEdge[]>([]);
  const [truncated, setTruncated] = useState(false);
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

  // Identity of the current request. `isLoading` is true from the render the request changes in
  // (not only once the effect has run), so consumers keying further queries on the nodes (map
  // metrics, group totals) never send them for the previous time range's nodes and then cancel.
  const request = useMemo(
    () => ({}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.startTime, params.endTime, refetchTrigger, params.refreshTrigger, queryIndex, dataset]
  );
  const [loadedRequest, setLoadedRequest] = useState<object | null>(null);

  const fetchParams = useMemo(
    () => ({
      queryIndex,
      startTime: params.startTime,
      endTime: params.endTime,
      dataset: dataset!,
    }),
    [queryIndex, params.startTime, params.endTime, dataset]
  );

  const enabled = params.enabled ?? true;
  useEffect(() => {
    // Skip fetching if config is not ready (or the map loads as an overview)
    if (!queryIndex || !dataset || !enabled) {
      setNodes([]);
      setEdges([]);
      setIsLoading(false);
      setLoadedRequest(request);
      return;
    }

    const abortController = new AbortController();
    setIsLoading(true);
    setError(null);

    const fetchServiceMap = async () => {
      try {
        const response: ServiceMapResponse = await pplSearchService.getServiceMap(
          fetchParams,
          abortController.signal
        );
        if (abortController.signal.aborted) return;

        setNodes(response.Nodes || []);
        setEdges(response.Edges || []);
        setTruncated(response.truncated ?? false);
        setAvailableGroupByAttributes(response.AvailableGroupByAttributes || {});
      } catch (err) {
        if (abortController.signal.aborted) return;
        console.error('[useServiceMap] Error fetching service map:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setNodes([]);
        setEdges([]);
        setTruncated(false);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
          setLoadedRequest(request);
        }
      }
    };

    fetchServiceMap();

    return () => abortController.abort();
  }, [
    pplSearchService,
    fetchParams,
    refetchTrigger,
    params.refreshTrigger,
    queryIndex,
    dataset,
    request,
    enabled,
  ]);

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  return {
    nodes,
    edges,
    isLoading: isLoading || loadedRequest !== request,
    error,
    availableGroupByAttributes,
    truncated,
    refetch,
  };
};
