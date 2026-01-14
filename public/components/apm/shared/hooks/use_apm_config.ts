/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { EuiComboBoxOptionOption } from '@elastic/eui';
import { DataPublicPluginStart } from '../../../../../../../src/plugins/data/public';
import { SavedObjectsClientContract } from '../../../../../../../src/core/public';
import { getOSDSavedObjectsClient } from '../../../../../common/utils';

interface DatasetOptionData {
  id: string;
  displayName?: string;
  title: string;
}

/**
 * Type guard to safely check if an unknown value is an Error
 */
function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

/**
 * Combined hook for loading all datasets and filtering traces
 * More efficient than separate calls since it fetches all datasets only once
 */
export const useDatasets = (dataService?: DataPublicPluginStart) => {
  const [state, setState] = useState<{
    tracesDatasets: Array<EuiComboBoxOptionOption<DatasetOptionData>>;
    allDatasets: Array<EuiComboBoxOptionOption<DatasetOptionData>>;
    loading: boolean;
    error?: Error;
  }>({ tracesDatasets: [], allDatasets: [], loading: false });

  const [refresh, setRefresh] = useState({});

  useEffect(() => {
    if (!dataService) {
      setState({ tracesDatasets: [], allDatasets: [], loading: false });
      return;
    }

    const abortController = new AbortController();
    setState((prev) => ({ ...prev, loading: true }));

    const fetchDatasets = async () => {
      try {
        const allDataViews = await dataService.dataViews.getIdsWithTitle(true);
        const tracesOptions: Array<EuiComboBoxOptionOption<DatasetOptionData>> = [];
        const allOptions: Array<EuiComboBoxOptionOption<DatasetOptionData>> = [];

        for (const { id, title } of allDataViews) {
          if (abortController.signal.aborted) break;

          try {
            const dataView = await dataService.dataViews.get(id);
            const displayName = dataView.getDisplayName();

            const option = {
              label: displayName,
              value: {
                id,
                displayName,
                title,
              },
            };

            // Add to all datasets
            allOptions.push(option);

            // Add to traces if signalType matches
            if (dataView.signalType === 'traces') {
              tracesOptions.push(option);
            }
          } catch (err) {
            console.error(`Failed to fetch dataset ${id}:`, err);
          }
        }

        if (!abortController.signal.aborted) {
          setState({
            tracesDatasets: tracesOptions,
            allDatasets: allOptions,
            loading: false,
          });
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error('Failed to fetch datasets:', error);
          setState({
            tracesDatasets: [],
            allDatasets: [],
            loading: false,
            error: toError(error),
          });
        }
      }
    };

    fetchDatasets();

    return () => abortController.abort();
  }, [dataService, refresh]);

  return { ...state, refresh: () => setRefresh({}) };
};

/**
 * Hook for loading Prometheus data connections
 * Uses datasetService.getType('PROMETHEUS').fetch() to list Prometheus connections
 */
export const usePrometheusDataSources = (dataService: DataPublicPluginStart) => {
  const [state, setState] = useState<{
    data: Array<EuiComboBoxOptionOption<{ id: string; title: string }>>;
    loading: boolean;
    error?: Error;
  }>({ data: [], loading: false });

  const [refresh, setRefresh] = useState({});

  useEffect(() => {
    const abortController = new AbortController();
    setState({ data: [], loading: true });

    const fetchPrometheus = async () => {
      try {
        const datasetService = dataService.query?.queryString?.getDatasetService?.();
        const prometheusType = datasetService?.getType('PROMETHEUS');

        if (!prometheusType) {
          if (!abortController.signal.aborted) {
            setState({ data: [], loading: false });
          }
          return;
        }

        // Use the prometheus type's fetch method
        const rootDataStructure = {
          id: 'PROMETHEUS',
          title: 'Prometheus',
          type: 'PROMETHEUS',
        };
        const result = await prometheusType.fetch(
          { savedObjects: { client: getOSDSavedObjectsClient() } } as any,
          [rootDataStructure]
        );

        if (!abortController.signal.aborted) {
          const options = (result.children || []).map((conn) => ({
            label: conn.title,
            value: {
              id: conn.id,
              title: conn.title,
            },
          }));
          setState({ data: options, loading: false });
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          setState({ data: [], loading: false, error: toError(error) });
        }
      }
    };

    fetchPrometheus();

    return () => abortController.abort();
  }, [dataService, refresh]);

  return { ...state, refresh: () => setRefresh({}) };
};

export interface CorrelatedLogDataset {
  id: string;
  displayName: string;
  title: string;
  schemaMappings?: Record<string, string>;
}

/**
 * Hook for loading correlated log datasets using SavedObjectsClient directly
 */
export const useCorrelatedLogs = (
  dataService?: DataPublicPluginStart,
  savedObjectsClient?: SavedObjectsClientContract,
  traceDatasetId?: string
) => {
  const [state, setState] = useState<{
    data: CorrelatedLogDataset[];
    loading: boolean;
    error?: Error;
  }>({ data: [], loading: false });

  useEffect(() => {
    if (!traceDatasetId || !dataService || !savedObjectsClient) {
      setState({ data: [], loading: false });
      return;
    }

    const abortController = new AbortController();
    setState({ data: [], loading: true });

    const fetchCorrelatedLogs = async () => {
      try {
        // Find correlations where trace dataset is referenced
        const response = await savedObjectsClient.find({
          type: 'correlations',
          perPage: 1000,
        });

        // Filter for APM correlations that reference our trace dataset
        // Only include correlations with correlationType === 'APM-Correlation'
        const relevantCorrelations = response.savedObjects.filter((obj) => {
          const isApmCorrelation = obj.attributes?.correlationType === 'APM-Correlation';
          if (!isApmCorrelation) {
            return false;
          }

          const hasTraceDataset = obj.references.some(
            (ref) => ref.type === 'index-pattern' && ref.id === traceDatasetId
          );
          return hasTraceDataset;
        });

        if (relevantCorrelations.length === 0) {
          setState({ data: [], loading: false });
          return;
        }

        // Extract log dataset IDs from references
        const logDatasetIds = new Set<string>();
        relevantCorrelations.forEach((correlation) => {
          correlation.references.forEach((ref) => {
            // Collect all index-pattern references except the trace dataset itself
            if (ref.type === 'index-pattern' && ref.id !== traceDatasetId) {
              logDatasetIds.add(ref.id);
            }
          });
        });

        // Fetch display names and schema mappings for each log dataset
        const logDatasets = await Promise.all(
          Array.from(logDatasetIds).map(async (logId) => {
            try {
              const dataView = await dataService.dataViews.get(logId);

              // Get schema mappings from saved object - return as-is, no defaults
              let schemaMappings: Record<string, string> | undefined;
              try {
                const savedObject = await savedObjectsClient.get('index-pattern', logId);
                const schemaMappingsStr = (savedObject.attributes as any)?.schemaMappings;
                if (schemaMappingsStr) {
                  const parsed = JSON.parse(schemaMappingsStr);
                  // Get first mapping type (e.g., otelLogs)
                  const firstMapping = Object.values(parsed)[0] as Record<string, string>;
                  if (firstMapping) {
                    schemaMappings = firstMapping;
                  }
                }
              } catch (e) {
                console.warn(`Failed to parse schema mappings for ${logId}:`, e);
              }

              return {
                id: logId,
                displayName: dataView.getDisplayName(),
                title: dataView.title,
                schemaMappings,
              };
            } catch (err) {
              console.error(`Failed to fetch log dataset ${logId}:`, err);
              return null;
            }
          })
        );

        if (!abortController.signal.aborted) {
          setState({
            data: logDatasets.filter((item) => item !== null) as CorrelatedLogDataset[],
            loading: false,
          });
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error('Failed to fetch correlated logs:', error);
          setState({ data: [], loading: false, error: toError(error) });
        }
      }
    };

    fetchCorrelatedLogs();

    return () => abortController.abort();
  }, [dataService, savedObjectsClient, traceDatasetId]);

  return state;
};
