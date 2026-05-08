/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Metric Browser — browse available metrics with cardinality info,
 * query time estimates, and optimization suggestions.
 */
import React, { useState, useMemo } from 'react';
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
  EuiToolTip,
  EuiIcon,
  EuiButtonEmpty,
} from '@elastic/eui';
import { MOCK_METRICS, MOCK_LABEL_NAMES } from './promql_editor';

// ============================================================================
// Mock metric metadata
// ============================================================================

interface MetricMeta {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  cardinality: number;
  labels: string[];
  scrapeInterval: string;
}

function generateMetricMeta(): MetricMeta[] {
  const typeMap: Record<string, 'counter' | 'gauge' | 'histogram' | 'summary'> = {
    _total: 'counter',
    _bytes_total: 'counter',
    _seconds_total: 'counter',
    _bytes: 'gauge',
    _ratio: 'gauge',
    _info: 'gauge',
    _bucket: 'histogram',
    _sum: 'histogram',
    _count: 'histogram',
  };
  return MOCK_METRICS.map((name) => {
    let type: MetricMeta['type'] = 'gauge';
    for (const [suffix, t] of Object.entries(typeMap)) {
      if (name.endsWith(suffix)) {
        type = t;
        break;
      }
    }
    const labels = MOCK_LABEL_NAMES.filter(() => Math.random() > 0.6).slice(0, 5);
    if (!labels.includes('instance')) labels.unshift('instance');
    if (!labels.includes('job')) labels.push('job');
    const cardinality = Math.floor(Math.random() * 5000) + 10;
    return {
      name,
      type,
      labels,
      help: `Help text for ${name}`,
      cardinality,
      scrapeInterval: '15s',
    };
  });
}

const METRIC_META = generateMetricMeta();

function cardinalityColor(c: number): string {
  if (c > 3000) return 'danger';
  if (c > 1000) return 'warning';
  return 'success';
}

function cardinalityLabel(c: number): string {
  if (c > 3000) return 'High';
  if (c > 1000) return 'Medium';
  return 'Low';
}

function estimateQueryTime(cardinality: number): string {
  if (cardinality > 3000) return '~500ms-2s';
  if (cardinality > 1000) return '~100-500ms';
  return '<100ms';
}

function getOptimizations(metric: MetricMeta, query?: string): string[] {
  const tips: string[] = [];
  if (metric.cardinality > 3000) {
    tips.push(
      `High cardinality (${metric.cardinality} series). Add label filters to reduce query scope.`
    );
  }
  if (
    metric.type === 'counter' &&
    query &&
    !query.includes('rate') &&
    !query.includes('increase')
  ) {
    tips.push('Counter metrics should typically be wrapped in rate() or increase().');
  }
  if (metric.type === 'histogram' && query && !query.includes('histogram_quantile')) {
    tips.push('Use histogram_quantile() to compute percentiles from histogram buckets.');
  }
  if (metric.labels.length > 6) {
    tips.push(
      `This metric has ${metric.labels.length} labels. Use by() or without() to aggregate.`
    );
  }
  return tips;
}

// ============================================================================
// Component
// ============================================================================

export interface MetricBrowserProps {
  onSelectMetric: (metricName: string) => void;
  currentQuery?: string;
}

export const MetricBrowser: React.FC<MetricBrowserProps> = ({ onSelectMetric, currentQuery }) => {
  const [search, setSearch] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<MetricMeta | null>(null);

  const filtered = useMemo(() => {
    if (!search) return METRIC_META;
    const q = search.toLowerCase();
    return METRIC_META.filter(
      (m) => m.name.toLowerCase().includes(q) || m.help.toLowerCase().includes(q)
    );
  }, [search]);

  const typeColors: Record<string, string> = {
    counter: 'primary',
    gauge: 'success',
    histogram: 'accent',
    summary: 'warning',
  };

  const columns = [
    {
      field: 'name',
      name: 'Metric',
      sortable: true,
      width: '280px',
      render: (name: string, item: MetricMeta) => (
        <EuiButtonEmpty
          size="xs"
          flush="left"
          onClick={() => {
            setSelectedMetric(item);
            onSelectMetric(name);
          }}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        >
          {name}
        </EuiButtonEmpty>
      ),
    },
    {
      field: 'type',
      name: 'Type',
      width: '100px',
      render: (t: string) => <EuiBadge color={typeColors[t] || 'default'}>{t}</EuiBadge>,
    },
    {
      field: 'cardinality',
      name: 'Cardinality',
      width: '120px',
      sortable: true,
      render: (c: number) => (
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiHealth color={cardinalityColor(c)}>{c.toLocaleString()}</EuiHealth>
          </EuiFlexItem>
          {c > 3000 && (
            <EuiFlexItem grow={false}>
              <EuiToolTip content="High cardinality — may impact query performance">
                <EuiIcon type="alert" color="warning" size="s" />
              </EuiToolTip>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      ),
    },
    {
      field: 'cardinality',
      name: 'Est. Query Time',
      width: '120px',
      render: (c: number) => (
        <EuiText size="xs" color="subdued">
          {estimateQueryTime(c)}
        </EuiText>
      ),
    },
    {
      field: 'labels',
      name: 'Labels',
      width: '200px',
      render: (labels: string[]) => (
        <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
          {labels.slice(0, 4).map((l) => (
            <EuiFlexItem grow={false} key={l}>
              <EuiBadge color="hollow">{l}</EuiBadge>
            </EuiFlexItem>
          ))}
          {labels.length > 4 && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">+{labels.length - 4}</EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      ),
    },
  ];

  const optimizations = selectedMetric ? getOptimizations(selectedMetric, currentQuery) : [];

  return (
    <div>
      <EuiFieldSearch
        placeholder="Search metrics by name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        isClearable
        fullWidth
        aria-label="Search metrics"
      />
      <EuiSpacer size="s" />

      {selectedMetric && (
        <>
          <EuiPanel paddingSize="s" color="subdued">
            <EuiFlexGroup gutterSize="m" responsive={false}>
              <EuiFlexItem>
                <EuiText size="s">
                  <strong>{selectedMetric.name}</strong>
                </EuiText>
                <EuiText size="xs" color="subdued">
                  {selectedMetric.help}
                </EuiText>
                <EuiSpacer size="xs" />
                <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={typeColors[selectedMetric.type]}>
                      {selectedMetric.type}
                    </EuiBadge>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiHealth color={cardinalityColor(selectedMetric.cardinality)}>
                      {selectedMetric.cardinality.toLocaleString()} series (
                      {cardinalityLabel(selectedMetric.cardinality)})
                    </EuiHealth>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">Scrape: {selectedMetric.scrapeInterval}</EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      Est: {estimateQueryTime(selectedMetric.cardinality)}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
                {optimizations.length > 0 && (
                  <>
                    <EuiSpacer size="xs" />
                    {optimizations.map((tip, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 4,
                          padding: '2px 0',
                        }}
                      >
                        <EuiIcon type="bulb" color="warning" size="s" style={{ marginTop: 2 }} />
                        <EuiText size="xs" color="subdued">
                          {tip}
                        </EuiText>
                      </div>
                    ))}
                  </>
                )}
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
      {filtered.length > 50 && (
        <EuiText size="xs" color="subdued" textAlign="center" style={{ padding: 8 }}>
          Showing 50 of {filtered.length} metrics. Refine your search.
        </EuiText>
      )}
    </div>
  );
};
