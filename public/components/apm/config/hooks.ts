/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { EuiComboBoxOptionOption } from '@elastic/eui';
import { DataPublicPluginStart } from '../../../../../../src/plugins/data/public';
import { SavedObjectsClientContract } from '../../../../../../src/core/public';
import { getOSDSavedObjectsClient } from '../../../../common/utils';

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
 * Hook for loading Prometheus data connections from SavedObjects
 */
export const usePrometheusDataSources = () => {
  const [state, setState] = useState<{
    data: Array<EuiComboBoxOptionOption<{ id: string; title: string }>>;
    loading: boolean;
    error?: Error;
  }>({ data: [], loading: false });

  const [refresh, setRefresh] = useState({});

  useEffect(() => {
    const abortController = new AbortController();
    setState({ data: [], loading: true });

    const client = getOSDSavedObjectsClient();

    client
      .find({
        type: 'data-connection',
        perPage: 10000,
      })
      .then((response) => {
        if (!abortController.signal.aborted) {
          // Filter for Prometheus data connections only (attributes.type === 'Prometheus')
          const prometheusDataSources = response.savedObjects.filter(
            (obj) => obj.attributes.type === 'Prometheus'
          );

          const options = prometheusDataSources.map((obj) => ({
            label: obj.attributes.connectionId || obj.attributes.title || obj.id,
            value: {
              id: obj.id,
              title: obj.attributes.connectionId || obj.attributes.title || obj.id,
            },
          }));
          setState({ data: options, loading: false });
        }
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          setState({ data: [], loading: false, error: toError(error) });
        }
      });

    return () => abortController.abort();
  }, [refresh]);

  return { ...state, refresh: () => setRefresh({}) };
};

/**
 * Hook for loading correlated log datasets using SavedObjectsClient directly
 * This bypasses the need for dataset_management's non-public CorrelationsClient
 */
export const useCorrelatedLogs = (
  dataService?: DataPublicPluginStart,
  savedObjectsClient?: SavedObjectsClientContract,
  traceDatasetId?: string
) => {
  const [state, setState] = useState<{
    data: Array<{ id: string; displayName: string }>;
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

        // Fetch display names for each log dataset
        const logDatasets = await Promise.all(
          Array.from(logDatasetIds).map(async (logId) => {
            try {
              const dataView = await dataService.dataViews.get(logId);
              return {
                id: logId,
                displayName: dataView.getDisplayName(),
              };
            } catch (err) {
              console.error(`Failed to fetch log dataset ${logId}:`, err);
              return null;
            }
          })
        );

        if (!abortController.signal.aborted) {
          setState({
            data: logDatasets.filter((item) => item !== null) as Array<{
              id: string;
              displayName: string;
            }>,
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
