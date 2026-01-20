/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { getQueryServiceAttributes } from '../../query_services/query_requests/ppl_queries';
import { DatasetConfig } from '../../common/types/apm_types';
import { useApmConfig } from '../../config/apm_config_context';

export interface UseServiceAttributesParams {
  serviceName: string;
  environment: string;
  startTime: Date;
  endTime: Date;
  refreshTrigger?: number;
}

export interface UseServiceAttributesResult {
  attributes: Record<string, string>; // Flattened groupByAttributes
  isLoading: boolean;
  error: Error | null;
}

/**
 * Flattens a nested object into dot-notation paths
 * @example
 * Input: { telemetry: { sdk: { language: "python" } } }
 * Output: { "telemetry.sdk.language": "python" }
 */
function flattenGroupByAttributes(obj: any, prefix: string = ''): Record<string, string> {
  const result: Record<string, string> = {};

  if (!obj || typeof obj !== 'object') {
    return result;
  }

  for (const [key, value] of Object.entries(obj)) {
    const newPath = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse for nested objects
      Object.assign(result, flattenGroupByAttributes(value, newPath));
    } else {
      // Leaf value - add to result
      result[newPath] = String(value);
    }
  }

  return result;
}

/**
 * Hook for fetching service groupByAttributes using PPL
 *
 * Fetches the groupByAttributes for a specific service and returns them
 * as a flattened key-value map (e.g., "telemetry.sdk.language": "python").
 *
 * @example
 * const { attributes, isLoading, error } = useServiceAttributes({
 *   serviceName: 'frontend',
 *   environment: 'generic:default',
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 * });
 */
export const useServiceAttributes = (
  params: UseServiceAttributesParams
): UseServiceAttributesResult => {
  const { config } = useApmConfig();
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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

  useEffect(() => {
    // Skip fetching if config is not ready or required params are missing
    if (!queryIndex || !dataset || !params.serviceName || !params.environment) {
      setAttributes({});
      setIsLoading(false);
      return;
    }

    const fetchAttributes = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const pplQuery = getQueryServiceAttributes(
          queryIndex,
          params.startTime,
          params.endTime,
          params.environment,
          params.serviceName
        );

        const response = await pplSearchService.executeQuery(pplQuery, dataset);

        // Extract groupByAttributes from the first row
        const rows = response.jsonData || [];
        if (rows.length > 0) {
          let groupByAttributes = rows[0]['service.groupByAttributes'] || {};

          // Parse JSON string if needed
          if (typeof groupByAttributes === 'string') {
            try {
              groupByAttributes = JSON.parse(groupByAttributes);
            } catch (e) {
              console.error('[useServiceAttributes] Failed to parse service.groupByAttributes:', e);
              groupByAttributes = {};
            }
          }

          // Flatten nested attributes to dot notation
          const flattenedAttributes = flattenGroupByAttributes(groupByAttributes);
          setAttributes(flattenedAttributes);
        } else {
          setAttributes({});
        }
      } catch (err) {
        console.error('[useServiceAttributes] Error fetching service attributes:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setAttributes({});
      } finally {
        setIsLoading(false);
      }
    };

    fetchAttributes();
  }, [
    pplSearchService,
    queryIndex,
    dataset,
    params.serviceName,
    params.environment,
    params.startTime,
    params.endTime,
    params.refreshTrigger,
  ]);

  return { attributes, isLoading, error };
};
