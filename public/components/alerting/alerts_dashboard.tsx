/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerts Dashboard — visualization-first view of alert history
 * with summary stats, charts, and drill-down table.
 */
import React, { useState, useMemo } from 'react';
import {
  EuiBasicTableColumn,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiHealth,
  EuiInMemoryTable,
  EuiText,
  EuiTitle,
  EuiButtonIcon,
  EuiToolTip,
  EuiFieldSearch,
  EuiEmptyPrompt,
  EuiButtonEmpty,
  EuiResizableContainer,
} from '@elastic/eui';
import { UnifiedAlertSummary, Datasource } from '../../../common/types/alerting';
import { filterAlerts } from '../../../common/services/alerting/filter';
import {
  SeverityDonut,
  AlertTimeline,
  StateBreakdown,
  AlertsByDatasource,
  AlertsByMonitor,
} from './alerts_charts';
import { AlertsSummaryCards } from './alerts_summary_cards';
import { FacetFilterGroup, useFacetCollapse } from './facet_filter_panel';
import { countBy } from './shared_constants';

// ============================================================================
// Color maps (used by table columns and filter panel)
// ============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#BD271E',
  high: '#F5A700',
  medium: '#006BB4',
  low: '#98A2B3',
  info: '#D3DAE6',
};
const STATE_COLORS: Record<string, string> = {
  active: '#BD271E',
  pending: '#F5A700',
  acknowledged: '#006BB4',
  resolved: '#017D73',
  error: '#BD271E',
  silenced: '#98A2B3',
};
const STATE_HEALTH: Record<string, string> = {
  active: 'danger',
  pending: 'warning',
  acknowledged: 'primary',
  resolved: 'success',
  error: 'danger',
  silenced: 'default',
};

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(startTime: string | number): string {
  const start = typeof startTime === 'number' ? startTime : new Date(startTime).getTime();
  const ms = Date.now() - start;
  if (ms < 60000) return '<1m';
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm';
  if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ' + (Math.floor(ms / 60000) % 60) + 'm';
  return Math.floor(ms / 86400000) + 'd ' + (Math.floor(ms / 3600000) % 24) + 'h';
}

const SEVERITY_SORT_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Internal label keys to hide from the filter panel */
const INTERNAL_LABEL_KEYS = new Set([
  'monitor_id',
  'datasource_id',
  '_workspace',
  'monitor_type',
  'monitor_kind',
  'trigger_id',
  'trigger_name',
]);

// ============================================================================
// Alert Filter State
// ============================================================================

interface AlertFilterState {
  severity: string[];
  state: string[];
  backend: string[];
  labels: Record<string, string[]>;
}

const emptyAlertFilters = (): AlertFilterState => ({
  severity: [],
  state: [],
  backend: [],
  labels: {},
});

function collectAlertUniqueValues(
  alerts: UnifiedAlertSummary[],
  field: (a: UnifiedAlertSummary) => string
): string[] {
  const set = new Set<string>();
  for (const a of alerts) {
    const val = field(a);
    if (val) set.add(val);
  }
  return Array.from(set).sort();
}

function collectAlertLabelKeys(alerts: UnifiedAlertSummary[]): string[] {
  const keys = new Set<string>();
  for (const a of alerts) {
    for (const k of Object.keys(a.labels)) keys.add(k);
  }
  return Array.from(keys).sort();
}

function collectAlertLabelValues(alerts: UnifiedAlertSummary[], key: string): string[] {
  const set = new Set<string>();
  for (const a of alerts) {
    const v = a.labels[key];
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}

// ============================================================================
// Memoized Table — keeps EuiInMemoryTable pagination state stable under the
// ancestor `EuiResizableContainer`, which re-renders on every mouse move.
// Without this wrap, the mid-click re-render cascade causes Chrome to drop
// the `click` event between mousedown and mouseup. Mirrors the pattern in
// public/components/apm/pages/services_home/services_home.tsx.
// ============================================================================

interface AlertsTableProps {
  items: UnifiedAlertSummary[];
  columns: Array<EuiBasicTableColumn<UnifiedAlertSummary>>;
  loading: boolean;
  message: React.ReactNode;
}

const AlertsTable = React.memo(({ items, columns, loading, message }: AlertsTableProps) => (
  <EuiInMemoryTable
    items={items}
    columns={columns}
    loading={loading}
    pagination={{ initialPageSize: 20, pageSizeOptions: [10, 20, 50, 100] }}
    sorting={{ sort: { field: 'startTime', direction: 'desc' } }}
    message={message}
  />
));

// ============================================================================
// Main Dashboard Component
// ============================================================================

export interface AlertsDashboardProps {
  alerts: UnifiedAlertSummary[];
  datasources: Datasource[];
  loading: boolean;
  onViewDetail: (alert: UnifiedAlertSummary) => void;
  onAcknowledge: (alertId: string) => void;
  /** Currently selected datasource IDs */
  selectedDsIds: string[];
  /** Callback when datasource selection changes */
  onDatasourceChange: (ids: string[]) => void;
}

export const AlertsDashboard: React.FC<AlertsDashboardProps> = ({
  alerts,
  datasources,
  loading,
  onViewDetail,
  onAcknowledge,
  selectedDsIds,
  onDatasourceChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [filters, setFilters] = useState<AlertFilterState>(emptyAlertFilters());
  const { toggleFacetCollapse, isCollapsed: isFacetCollapsed } = useFacetCollapse();

  // Build selectable datasource entries for the filter facet — alpha by name
  const datasourceEntries = useMemo(
    () =>
      datasources
        .map((ds) => ({ id: ds.id, label: ds.name }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
    [datasources]
  );

  // Unique values for facets
  const uniqueSeverities = useMemo(() => collectAlertUniqueValues(alerts, (a) => a.severity), [
    alerts,
  ]);
  const uniqueStates = useMemo(() => collectAlertUniqueValues(alerts, (a) => a.state), [alerts]);
  const uniqueBackends = useMemo(() => collectAlertUniqueValues(alerts, (a) => a.datasourceType), [
    alerts,
  ]);
  const labelKeys = useMemo(() => collectAlertLabelKeys(alerts), [alerts]);

  // Facet counts (against search-matched but not filter-matched alerts)
  const facetCounts = useMemo(() => {
    const searchMatched = alerts.filter((a) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        (a.message || '').toLowerCase().includes(q) ||
        Object.values(a.labels).some((v) => v.toLowerCase().includes(q))
      );
    });
    const counts: Record<string, Record<string, number>> = {
      severity: {},
      state: {},
      backend: {},
    };
    for (const a of searchMatched) {
      counts.severity[a.severity] = (counts.severity[a.severity] || 0) + 1;
      counts.state[a.state] = (counts.state[a.state] || 0) + 1;
      counts.backend[a.datasourceType] = (counts.backend[a.datasourceType] || 0) + 1;
    }
    const labelCounts: Record<string, Record<string, number>> = {};
    for (const key of labelKeys) {
      labelCounts[key] = {};
      for (const a of searchMatched) {
        const v = a.labels[key];
        if (v) labelCounts[key][v] = (labelCounts[key][v] || 0) + 1;
      }
    }
    return { counts, labelCounts };
  }, [alerts, searchQuery, labelKeys]);

  const activeFilterCount = useMemo(() => {
    let count = filters.severity.length + filters.state.length + filters.backend.length;
    for (const vals of Object.values(filters.labels)) count += vals.length;
    return count;
  }, [filters]);

  // Filtered + sorted alerts for the table
  const filteredAlerts = useMemo(() => {
    // Combine stat-card filters with panel filters
    let sevArr: string[] | undefined;
    if (filters.severity.length > 0) {
      sevArr = filters.severity;
    } else if (severityFilter === 'medium') {
      sevArr = ['medium', 'low', 'info'];
    } else if (severityFilter !== 'all') {
      sevArr = [severityFilter];
    }

    let stateArr: string[] | undefined;
    if (filters.state.length > 0) {
      stateArr = filters.state;
    } else if (stateFilter !== 'all') {
      stateArr = [stateFilter];
    }

    let result = filterAlerts(alerts, {
      severity: sevArr,
      state: stateArr,
      labels: Object.keys(filters.labels).length > 0 ? filters.labels : undefined,
      search: searchQuery || undefined,
    });

    // Apply backend filter separately (not in core filterAlerts)
    if (filters.backend.length > 0) {
      result = result.filter((a) => filters.backend.includes(a.datasourceType));
    }

    return result;
  }, [alerts, searchQuery, severityFilter, stateFilter, filters]);

  // Severity counts for stat cards — derived from filtered set
  const severityCounts = useMemo(() => countBy(filteredAlerts, (a) => a.severity), [
    filteredAlerts,
  ]);
  const activeCount = useMemo(() => filteredAlerts.filter((a) => a.state === 'active').length, [
    filteredAlerts,
  ]);
  const isFiltered =
    activeFilterCount > 0 ||
    searchQuery !== '' ||
    severityFilter !== 'all' ||
    stateFilter !== 'all';

  const clearAllFilters = () => {
    setFilters(emptyAlertFilters());
    setSeverityFilter('all');
    setStateFilter('all');
    setSearchQuery('');
  };

  const updateFilter = <K extends keyof AlertFilterState>(key: K, value: AlertFilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    if (key === 'severity') setSeverityFilter('all');
    if (key === 'state') setStateFilter('all');
  };

  const updateLabelFilter = (key: string, values: string[]) => {
    setFilters((prev) => ({ ...prev, labels: { ...prev.labels, [key]: values } }));
  };

  const renderFacetGroup = (
    id: string,
    label: string,
    options: string[],
    selected: string[],
    onChange: (v: string[]) => void,
    counts: Record<string, number>,
    colorMap?: Record<string, string>
  ) => (
    <FacetFilterGroup
      key={id}
      id={id}
      label={label}
      options={options}
      selected={selected}
      onChange={onChange}
      counts={counts}
      colorMap={colorMap}
      isCollapsed={isFacetCollapsed(id)}
      onToggleCollapse={toggleFacetCollapse}
    />
  );

  // Table columns — memoized so `AlertsTable`'s React.memo shallow-compare
  // doesn't invalidate on every parent re-render.
  const columns = useMemo<Array<EuiBasicTableColumn<UnifiedAlertSummary>>>(
    () => [
      {
        field: 'severity',
        name: 'Sev',
        width: '60px',
        sortable: (a: UnifiedAlertSummary) => SEVERITY_SORT_ORDER[a.severity] ?? 5,
        render: (s: string) => (
          <EuiToolTip content={s}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: SEVERITY_COLORS[s],
                display: 'inline-block',
              }}
            />
          </EuiToolTip>
        ),
      },
      {
        field: 'name',
        name: 'Alert',
        sortable: true,
        truncateText: true,
        render: (name: string, alert: UnifiedAlertSummary) => (
          <EuiButtonEmpty
            size="xs"
            flush="left"
            onClick={() => onViewDetail(alert)}
            style={{ fontWeight: 500 }}
          >
            {name}
          </EuiButtonEmpty>
        ),
      },
      {
        field: 'state',
        name: 'State',
        width: '140px',
        sortable: true,
        render: (state: string) => (
          <EuiHealth color={STATE_HEALTH[state] || 'subdued'}>{state}</EuiHealth>
        ),
      },
      {
        field: 'datasourceType',
        name: 'Source',
        width: '130px',
        render: (t: string) => {
          const displayName =
            t === 'opensearch' ? 'OpenSearch' : t === 'prometheus' ? 'Prometheus' : t;
          return <EuiText size="xs">{displayName}</EuiText>;
        },
      },
      {
        field: 'message',
        name: 'Message',
        truncateText: true,
        render: (msg: string) => (
          <EuiText size="xs" color="subdued">
            {msg || '—'}
          </EuiText>
        ),
      },
      {
        field: 'startTime',
        name: 'Started',
        width: '120px',
        sortable: true,
        render: (ts: string) => {
          if (!ts) return <EuiText size="xs">---</EuiText>;
          const abs = new Date(ts).toLocaleString();
          return (
            <EuiToolTip content={abs}>
              <span style={{ fontSize: 12 }}>{formatDuration(ts)} ago</span>
            </EuiToolTip>
          );
        },
      },
      {
        field: 'startTime',
        name: 'Duration',
        width: '90px',
        render: (ts: string) => <EuiText size="xs">{ts ? formatDuration(ts) : '—'}</EuiText>,
      },
      {
        name: 'Actions',
        width: '150px',
        render: (alert: UnifiedAlertSummary) => (
          <EuiFlexGroup gutterSize="xs" responsive={false} wrap={false} alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiToolTip content="View details">
                <EuiButtonIcon
                  iconType="inspect"
                  aria-label="View"
                  size="s"
                  onClick={() => onViewDetail(alert)}
                />
              </EuiToolTip>
            </EuiFlexItem>
            {alert.state === 'active' && alert.datasourceType !== 'prometheus' && (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  iconType="check"
                  size="xs"
                  color="primary"
                  onClick={() => onAcknowledge(alert.id)}
                >
                  Ack
                </EuiButtonEmpty>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        ),
      },
    ],
    [onAcknowledge, onViewDetail]
  );

  const emptyState = !loading && alerts.length === 0;

  return (
    <EuiResizableContainer style={{ flex: 1, minHeight: 0 }}>
      {(EuiResizablePanel, EuiResizableButton) => (
        <>
          <EuiResizablePanel
            id="alerts-filters-panel"
            initialSize={15}
            minSize="180px"
            mode={['collapsible', { position: 'top' }]}
            onToggleCollapsed={() => {}}
            paddingSize="none"
            style={{ overflow: 'auto', paddingRight: '4px' }}
          >
            <EuiPanel
              paddingSize="s"
              hasBorder
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ flex: 1, overflow: 'auto' }}>
                <EuiFlexGroup
                  gutterSize="xs"
                  alignItems="center"
                  responsive={false}
                  justifyContent="spaceBetween"
                >
                  <EuiFlexItem>
                    <EuiText size="xs">
                      <strong>Filters</strong>
                    </EuiText>
                  </EuiFlexItem>
                  {activeFilterCount > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty size="xs" onClick={clearAllFilters} flush="right">
                        Clear ({activeFilterCount})
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
                <EuiSpacer size="s" />

                {/* Datasource filter — searchable, max 10 visible, max 5 selected */}
                <FacetFilterGroup
                  id="datasource"
                  label="Datasource"
                  options={datasourceEntries.map((e) => e.label)}
                  selected={selectedDsIds
                    .map((id) => datasourceEntries.find((e) => e.id === id)?.label || '')
                    .filter(Boolean)}
                  onChange={(labels) => {
                    const ids = labels
                      .map((l) => datasourceEntries.find((e) => e.label === l)?.id)
                      .filter(Boolean) as string[];
                    onDatasourceChange(ids);
                  }}
                  counts={countBy(
                    datasourceEntries.filter(
                      (e) => selectedDsIds.includes(e.id) || selectedDsIds.length === 0
                    ),
                    (e) => e.label
                  )}
                  searchable
                  maxVisible={10}
                  maxSelected={5}
                  searchAriaLabel="Search datasources"
                  checkedFirst
                  isCollapsed={isFacetCollapsed('datasource')}
                  onToggleCollapse={toggleFacetCollapse}
                />

                {renderFacetGroup(
                  'severity',
                  'Severity',
                  uniqueSeverities,
                  filters.severity,
                  (v) => updateFilter('severity', v),
                  facetCounts.counts.severity,
                  SEVERITY_COLORS
                )}
                {renderFacetGroup(
                  'state',
                  'State',
                  uniqueStates,
                  filters.state,
                  (v) => updateFilter('state', v),
                  facetCounts.counts.state,
                  STATE_COLORS
                )}
                {renderFacetGroup(
                  'backend',
                  'Backend',
                  uniqueBackends,
                  filters.backend,
                  (v) => updateFilter('backend', v),
                  facetCounts.counts.backend
                )}

                {labelKeys.length > 0 && (
                  <>
                    <EuiSpacer size="xs" />
                    <EuiText size="xs" color="subdued" style={{ marginBottom: 6 }}>
                      <strong>Labels</strong>
                    </EuiText>
                    {labelKeys
                      .filter((key) => !INTERNAL_LABEL_KEYS.has(key))
                      .map((key) =>
                        renderFacetGroup(
                          `label:${key}`,
                          key,
                          collectAlertLabelValues(alerts, key),
                          filters.labels[key] || [],
                          (v) => updateLabelFilter(key, v),
                          facetCounts.labelCounts[key] || {}
                        )
                      )}
                  </>
                )}
              </div>
            </EuiPanel>
          </EuiResizablePanel>

          <EuiResizableButton />

          <EuiResizablePanel
            initialSize={85}
            minSize="400px"
            mode="main"
            paddingSize="none"
            style={{ paddingLeft: '4px', overflow: 'auto' }}
          >
            {emptyState ? (
              <EuiEmptyPrompt
                title={<h2>No Active Alerts</h2>}
                body={<p>All systems operating normally.</p>}
                iconType="checkInCircleFilled"
                iconColor="success"
              />
            ) : (
              <>
                {/* ---- Summary Stat Cards (extracted component) ---- */}
                <AlertsSummaryCards
                  filteredCount={filteredAlerts.length}
                  totalCount={alerts.length}
                  activeCount={activeCount}
                  severityCounts={severityCounts}
                  severityFilter={severityFilter}
                  stateFilter={stateFilter}
                  filtersSeverityLength={filters.severity.length}
                  filtersStateLength={filters.state.length}
                  isFiltered={isFiltered}
                  onShowAll={() => {
                    setSeverityFilter('all');
                    setStateFilter('all');
                    setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                  }}
                  onToggleActive={() => {
                    setSeverityFilter('all');
                    setStateFilter(stateFilter === 'active' ? 'all' : 'active');
                    setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                  }}
                  onToggleCritical={() => {
                    setStateFilter('all');
                    setSeverityFilter(severityFilter === 'critical' ? 'all' : 'critical');
                    setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                  }}
                  onToggleHigh={() => {
                    setStateFilter('all');
                    setSeverityFilter(severityFilter === 'high' ? 'all' : 'high');
                    setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                  }}
                  onToggleMedium={() => {
                    setStateFilter('all');
                    setSeverityFilter(severityFilter === 'medium' ? 'all' : 'medium');
                    setFilters((prev) => ({ ...prev, severity: [], state: [] }));
                  }}
                />

                <EuiSpacer size="m" />

                {/* ---- Visualization Row ---- */}
                <EuiFlexGroup gutterSize="m" responsive={true}>
                  <EuiFlexItem grow={3}>
                    <EuiPanel paddingSize="m" hasBorder>
                      <EuiTitle size="xxs">
                        <h4>Alert Timeline (24h)</h4>
                      </EuiTitle>
                      <EuiSpacer size="s" />
                      <AlertTimeline alerts={filteredAlerts} />
                    </EuiPanel>
                  </EuiFlexItem>
                  <EuiFlexItem grow={1}>
                    <EuiPanel paddingSize="m" hasBorder>
                      <EuiTitle size="xxs">
                        <h4>By Severity</h4>
                      </EuiTitle>
                      <EuiSpacer size="s" />
                      <SeverityDonut alerts={filteredAlerts} />
                    </EuiPanel>
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiSpacer size="m" />

                {/* ---- State + Service Row ---- */}
                <EuiFlexGroup gutterSize="m" responsive={true}>
                  <EuiFlexItem>
                    <EuiPanel paddingSize="m" hasBorder>
                      <EuiTitle size="xxs">
                        <h4>By State</h4>
                      </EuiTitle>
                      <EuiSpacer size="s" />
                      <StateBreakdown alerts={filteredAlerts} />
                    </EuiPanel>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiPanel paddingSize="m" hasBorder>
                      <EuiTitle size="xxs">
                        <h4>By Source</h4>
                      </EuiTitle>
                      <EuiSpacer size="s" />
                      <AlertsByDatasource alerts={filteredAlerts} />
                    </EuiPanel>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiPanel paddingSize="m" hasBorder>
                      <EuiTitle size="xxs">
                        <h4>By Monitor</h4>
                      </EuiTitle>
                      <EuiSpacer size="s" />
                      <AlertsByMonitor alerts={filteredAlerts} />
                    </EuiPanel>
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiSpacer size="l" />

                {/* ---- Search + Table ---- */}
                <EuiPanel paddingSize="m" hasBorder>
                  <EuiTitle size="xs">
                    <h2>All Alerts</h2>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <EuiFieldSearch
                    placeholder="Search alerts by name, message, or label..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    isClearable
                    fullWidth
                    aria-label="Search alerts"
                  />
                  <EuiSpacer size="s" />
                  <EuiText size="s">
                    <strong>{filteredAlerts.length}</strong> alerts
                    {activeFilterCount > 0 && (
                      <span>
                        {' '}
                        · {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </EuiText>
                  <EuiSpacer size="s" />
                  <AlertsTable
                    items={filteredAlerts}
                    columns={columns}
                    loading={loading}
                    message={
                      searchQuery ||
                      activeFilterCount > 0 ||
                      severityFilter !== 'all' ||
                      stateFilter !== 'all'
                        ? 'No alerts match your filters'
                        : 'No alerts'
                    }
                  />
                </EuiPanel>
              </>
            )}
          </EuiResizablePanel>
        </>
      )}
    </EuiResizableContainer>
  );
};
