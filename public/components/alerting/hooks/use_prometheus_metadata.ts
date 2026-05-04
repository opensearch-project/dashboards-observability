/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * React hook for fetching Prometheus metadata (metric names, label names,
 * label values, metric metadata) with cascading logic.
 *
 * Features:
 *  - Debounced metric search (300ms, requires 2+ chars)
 *  - Auto-fetches label names when selectedMetric changes
 *  - Graceful degradation: sets `error` flag so UI falls back to EuiFieldText
 *  - `applyTemplate()` suppresses the auto-fetch for the current render cycle
 *  - All options formatted as `{ label: string }[]` for EuiComboBox
 *  - Max 50 options displayed (truncated from server's 200)
 */
import { useReducer, useEffect, useMemo, useRef, useCallback } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { AlertingPromResourcesService } from '../query_services/alerting_prom_resources_service';
import type { PrometheusMetricMetadata } from '../../../../common/types/alerting';

// ============================================================================
// Public interface
// ============================================================================

export interface UsePrometheusMetadataOptions {
  datasourceId: string;
  selectedMetric?: string;
}

export interface UsePrometheusMetadataReturn {
  /** Metric name options for EuiComboBox. */
  metricOptions: EuiComboBoxOptionOption[];
  /** Whether metric search is in progress. */
  metricsLoading: boolean;
  /** Trigger a debounced metric name search. */
  searchMetrics: (query: string) => void;
  /** Label name strings for EuiSelect. */
  labelNames: string[];
  /** Whether label names are loading. */
  labelNamesLoading: boolean;
  /** Cached label values keyed by label name, for EuiComboBox. */
  labelValues: Record<string, EuiComboBoxOptionOption[]>;
  /** Whether a specific label's values are loading. */
  labelValuesLoading: Record<string, boolean>;
  /** Fetch label values for a specific label (filtered by metric). */
  fetchLabelValues: (labelName: string) => void;
  /** Metric metadata for type detection. */
  metricMetadata: PrometheusMetricMetadata[];
  /** If true, metadata APIs failed — UI should fall back to EuiFieldText. */
  error: boolean;
  /** Suppress auto-fetch for the current cycle (used during template application). */
  applyTemplate: () => void;
}

// ============================================================================
// Internal state
// ============================================================================

const MAX_OPTIONS = 50;
const DEBOUNCE_MS = 300;
const MIN_SEARCH_CHARS = 2;

interface MetadataState {
  metricOptions: EuiComboBoxOptionOption[];
  metricsLoading: boolean;
  labelNames: string[];
  labelNamesLoading: boolean;
  labelValues: Record<string, EuiComboBoxOptionOption[]>;
  labelValuesLoading: Record<string, boolean>;
  metricMetadata: PrometheusMetricMetadata[];
  error: boolean;
}

type MetadataAction =
  | { type: 'METRICS_LOADING' }
  | { type: 'METRICS_LOADED'; options: EuiComboBoxOptionOption[] }
  | { type: 'METRICS_ERROR' }
  | { type: 'LABELS_LOADING' }
  | { type: 'LABELS_LOADED'; names: string[] }
  | { type: 'LABELS_ERROR' }
  | { type: 'LABEL_VALUES_LOADING'; labelName: string }
  | { type: 'LABEL_VALUES_LOADED'; labelName: string; options: EuiComboBoxOptionOption[] }
  | { type: 'LABEL_VALUES_ERROR'; labelName: string }
  | { type: 'METADATA_LOADED'; metadata: PrometheusMetricMetadata[] }
  | { type: 'CLEAR_LABEL_VALUES' };

const initialState: MetadataState = {
  metricOptions: [],
  metricsLoading: false,
  labelNames: [],
  labelNamesLoading: false,
  labelValues: {},
  labelValuesLoading: {},
  metricMetadata: [],
  error: false,
};

function metadataReducer(state: MetadataState, action: MetadataAction): MetadataState {
  switch (action.type) {
    case 'METRICS_LOADING':
      return { ...state, metricsLoading: true };
    case 'METRICS_LOADED':
      return { ...state, metricsLoading: false, metricOptions: action.options, error: false };
    case 'METRICS_ERROR':
      return { ...state, metricsLoading: false, error: true };
    case 'LABELS_LOADING':
      return { ...state, labelNamesLoading: true };
    case 'LABELS_LOADED':
      return { ...state, labelNamesLoading: false, labelNames: action.names };
    case 'LABELS_ERROR':
      return { ...state, labelNamesLoading: false };
    case 'LABEL_VALUES_LOADING':
      return {
        ...state,
        labelValuesLoading: { ...state.labelValuesLoading, [action.labelName]: true },
      };
    case 'LABEL_VALUES_LOADED':
      return {
        ...state,
        labelValuesLoading: { ...state.labelValuesLoading, [action.labelName]: false },
        labelValues: { ...state.labelValues, [action.labelName]: action.options },
      };
    case 'LABEL_VALUES_ERROR':
      return {
        ...state,
        labelValuesLoading: { ...state.labelValuesLoading, [action.labelName]: false },
      };
    case 'METADATA_LOADED':
      return { ...state, metricMetadata: action.metadata };
    case 'CLEAR_LABEL_VALUES':
      return { ...state, labelValues: {}, labelValuesLoading: {} };
    default:
      return state;
  }
}

// ============================================================================
// Hook
// ============================================================================

function toOptions(strings: string[]): EuiComboBoxOptionOption[] {
  return strings.slice(0, MAX_OPTIONS).map((s) => ({ label: s }));
}

export function usePrometheusMetadata(
  options: UsePrometheusMetadataOptions
): UsePrometheusMetadataReturn {
  const { datasourceId, selectedMetric } = options;
  // Don't instantiate the service when no datasource is selected — the
  // constructor now rejects empty strings. Effects short-circuit on `!service`.
  const service = useMemo(
    () => (datasourceId ? new AlertingPromResourcesService(datasourceId) : null),
    [datasourceId]
  );
  const [state, dispatch] = useReducer(metadataReducer, initialState);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressAutoFetchRef = useRef(false);
  const prevMetricRef = useRef<string | undefined>(undefined);

  // ------------------------------------------------------------------
  // searchMetrics — debounced metric name search
  // ------------------------------------------------------------------

  const searchMetrics = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!service) return;

      if (query.length < MIN_SEARCH_CHARS) {
        dispatch({ type: 'METRICS_LOADED', options: [] });
        return;
      }

      dispatch({ type: 'METRICS_LOADING' });
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await service.listMetricNames(query);
          dispatch({ type: 'METRICS_LOADED', options: toOptions(res.metrics) });
        } catch {
          dispatch({ type: 'METRICS_ERROR' });
        }
      }, DEBOUNCE_MS);
    },
    [service]
  );

  // ------------------------------------------------------------------
  // Auto-fetch label names when selectedMetric changes
  // ------------------------------------------------------------------

  useEffect(() => {
    if (selectedMetric === prevMetricRef.current) return;
    prevMetricRef.current = selectedMetric;

    if (suppressAutoFetchRef.current) {
      suppressAutoFetchRef.current = false;
      return;
    }

    if (!selectedMetric || !service) return;

    dispatch({ type: 'LABELS_LOADING' });
    dispatch({ type: 'CLEAR_LABEL_VALUES' });

    let cancelled = false;
    (async () => {
      try {
        const res = await service.listLabelNames(selectedMetric);
        if (!cancelled) {
          dispatch({ type: 'LABELS_LOADED', names: res.labels });
        }
      } catch {
        if (!cancelled) dispatch({ type: 'LABELS_ERROR' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedMetric, service]);

  // ------------------------------------------------------------------
  // Fetch metric metadata once on mount
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await service.getMetricMetadata();
        if (!cancelled) {
          dispatch({ type: 'METADATA_LOADED', metadata: res.metadata });
        }
      } catch (err) {
        // Non-critical — metadata is used for type badges only. Log so the
        // failure is visible in console instead of silently swallowed.

        console.warn('Prometheus metric metadata fetch failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [service]);

  // ------------------------------------------------------------------
  // fetchLabelValues — fetch values for a specific label, filtered by metric
  // ------------------------------------------------------------------

  const fetchLabelValues = useCallback(
    (labelName: string) => {
      if (!labelName || !service) return;

      dispatch({ type: 'LABEL_VALUES_LOADING', labelName });
      const selector =
        selectedMetric && /^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(selectedMetric)
          ? `{__name__="${selectedMetric}"}`
          : undefined;

      (async () => {
        try {
          const res = await service.listLabelValues(labelName, selector);
          dispatch({
            type: 'LABEL_VALUES_LOADED',
            labelName,
            options: toOptions(res.values),
          });
        } catch {
          dispatch({ type: 'LABEL_VALUES_ERROR', labelName });
        }
      })();
    },
    [service, selectedMetric]
  );

  // ------------------------------------------------------------------
  // applyTemplate — suppress auto-fetch for the current render cycle
  // ------------------------------------------------------------------

  const applyTemplate = useCallback(() => {
    suppressAutoFetchRef.current = true;
  }, []);

  // ------------------------------------------------------------------
  // Cleanup debounce timer
  // ------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    metricOptions: state.metricOptions,
    metricsLoading: state.metricsLoading,
    searchMetrics,
    labelNames: state.labelNames,
    labelNamesLoading: state.labelNamesLoading,
    labelValues: state.labelValues,
    labelValuesLoading: state.labelValuesLoading,
    fetchLabelValues,
    metricMetadata: state.metricMetadata,
    error: state.error,
    applyTemplate,
  };
}
