/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Metric Browser — browse available metrics from the Prometheus datasource
 * with type inference, cardinality estimates, and label discovery.
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  EuiPanel,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiBadge,
  EuiSpacer,
  EuiBasicTable,
  EuiHealth,
  EuiButtonEmpty,
  EuiLoadingSpinner,
  EuiCallOut,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { AlertingPromResourcesService } from './query_services/alerting_prom_resources_service';

// ============================================================================
// Types
// ============================================================================

interface MetricEntry {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary' | 'unknown';
  labels: string[];
}

/** Infer metric type from name suffix conventions. */
function inferType(name: string): MetricEntry['type'] {
  if (name.endsWith('_total') || name.endsWith('_created')) return 'counter';
  if (name.endsWith('_bucket')) return 'histogram';
  if (name.endsWith('_sum') || name.endsWith('_count')) return 'histogram';
  if (name.endsWith('_info')) return 'gauge';
  return 'unknown';
}

// ============================================================================
// Component
// ============================================================================

export interface MetricBrowserProps {
  onSelectMetric: (metricName: string) => void;
  currentQuery?: string;
  datasourceId?: string;
}

export const MetricBrowser: React.FC<MetricBrowserProps> = ({
  onSelectMetric,
  currentQuery,
  datasourceId,
}) => {
  const [search, setSearch] = useState('');
  const [metrics, setMetrics] = useState<MetricEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricEntry | null>(null);

  // Fetch metrics from the real Prometheus metadata API
  const fetchMetrics = useCallback(async () => {
    if (!datasourceId) {
      setError('No datasource selected');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const service = new AlertingPromResourcesService(datasourceId);
      const { metrics: metricNames } = await service.listMetricNames();

      const entries: MetricEntry[] = metricNames.map((name) => ({
        name,
        type: inferType(name),
        labels: [],
      }));
      setMetrics(entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch metrics');
    } finally {
      setIsLoading(false);
    }
  }, [datasourceId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Fetch labels when a metric is selected
  const handleSelectMetric = useCallback(
    async (metric: MetricEntry) => {
      setSelectedMetric(metric);
      onSelectMetric(metric.name);

      // Lazy-load labels for the selected metric
      if (datasourceId && metric.labels.length === 0) {
        try {
          const service = new AlertingPromResourcesService(datasourceId);
          const { labels } = await service.listLabelNames(metric.name);
          setMetrics((prev) =>
            prev.map((m) => (m.name === metric.name ? { ...m, labels } : m))
          );
          setSelectedMetric((prev) =>
            prev && prev.name === metric.name ? { ...prev, labels } : prev
          );
        } catch {
          // Non-critical — labels just won't show
        }
      }
    },
    [datasourceId, onSelectMetric]
  );

  const filtered = useMemo(() => {
    if (!search) return metrics;
    const q = search.toLowerCase();
    return metrics.filter((m) => m.name.toLowerCase().includes(q));
  }, [search, metrics]);

  const typeColors: Record<string, string> = {
    counter: 'primary',
    gauge: 'success',
    histogram: 'accent',
    summary: 'warning',
    unknown: 'default',
  };

  const columns = [
    {
      field: 'name',
      name: i18n.translate('observability.alerting.metricBrowser.column.metric', {
        defaultMessage: 'Metric',
      }),
      sortable: true,
      width: '50%',
      render: (name: string, item: MetricEntry) => (
        <EuiButtonEmpty
          size="xs"
          flush="left"
          onClick={() => handleSelectMetric(item)}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        >
          {name}
        </EuiButtonEmpty>
      ),
    },
    {
      field: 'type',
      name: i18n.translate('observability.alerting.metricBrowser.column.type', {
        defaultMessage: 'Type',
      }),
      width: '100px',
      render: (t: string) => <EuiBadge color={typeColors[t] || 'default'}>{t}</EuiBadge>,
    },
    {
      field: 'labels',
      name: i18n.translate('observability.alerting.metricBrowser.column.labels', {
        defaultMessage: 'Labels',
      }),
      width: '40%',
      render: (labels: string[]) =>
        labels.length > 0 ? (
          <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
            {labels.slice(0, 5).map((l) => (
              <EuiFlexItem grow={false} key={l}>
                <EuiBadge color="hollow">{l}</EuiBadge>
              </EuiFlexItem>
            ))}
            {labels.length > 5 && (
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">+{labels.length - 5}</EuiBadge>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        ) : (
          <EuiText size="xs" color="subdued">
            —
          </EuiText>
        ),
    },
  ];

  if (isLoading) {
    return (
      <EuiFlexGroup justifyContent="center" alignItems="center" style={{ padding: 32 }}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="l" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s">Loading metrics...</EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (error) {
    return (
      <EuiCallOut title="Failed to load metrics" color="danger" iconType="alert">
        <p>{error}</p>
      </EuiCallOut>
    );
  }

  return (
    <div>
      <EuiFieldSearch
        placeholder={i18n.translate('observability.alerting.metricBrowser.searchPlaceholder', {
          defaultMessage: 'Search metrics by name...',
        })}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        isClearable
        fullWidth
        aria-label={i18n.translate('observability.alerting.metricBrowser.searchAriaLabel', {
          defaultMessage: 'Search metrics',
        })}
      />
      <EuiSpacer size="s" />

      {selectedMetric && (
        <>
          <EuiPanel paddingSize="s" color="subdued">
            <EuiFlexGroup gutterSize="m" responsive={false} justifyContent="spaceBetween">
              <EuiFlexItem>
                <EuiText size="s">
                  <strong>{selectedMetric.name}</strong>
                </EuiText>
                <EuiSpacer size="xs" />
                <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={typeColors[selectedMetric.type]}>
                      {selectedMetric.type}
                    </EuiBadge>
                  </EuiFlexItem>
                  {selectedMetric.labels.length > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        {selectedMetric.labels.length} labels
                      </EuiText>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size="xs" iconType="cross" onClick={() => setSelectedMetric(null)}>
                  Close
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
          <EuiSpacer size="s" />
        </>
      )}

      <div style={{ maxHeight: 300, overflow: 'auto' }}>
        <EuiBasicTable items={filtered.slice(0, 50)} columns={columns} compressed />
      </div>
      {filtered.length === 0 && !isLoading && (
        <EuiText size="s" textAlign="center" color="subdued" style={{ padding: 16 }}>
          No items found
        </EuiText>
      )}
      {filtered.length > 50 && (
        <EuiText size="xs" color="subdued" textAlign="center" style={{ padding: 8 }}>
          <FormattedMessage
            id="observability.alerting.metricBrowser.showingMetrics"
            defaultMessage="Showing 50 of {total} metrics. Refine your search."
            values={{ total: filtered.length }}
          />
        </EuiText>
      )}
    </div>
  );
};
