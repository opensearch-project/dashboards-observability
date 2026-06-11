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
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiHealth,
  EuiInMemoryTable,
  EuiLink,
  EuiText,
  EuiTitle,
  EuiButtonIcon,
  EuiToolTip,
  EuiFieldSearch,
  EuiEmptyPrompt,
  EuiButtonEmpty,
  EuiResizableContainer,
  EuiCallOut,
  EuiHorizontalRule,
  EuiSuperDatePicker,
  EuiSplitPanel,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import {
  DatasourceFetchFallback,
  UnifiedAlertSummary,
  Datasource,
} from '../../../common/types/alerting';
import { filterAlerts } from '../../../common/services/alerting/filter';
import { AlertTimeline } from './alerts_charts';
import { FacetFilterGroup, useFacetCollapse } from './facet_filter_panel';
import { countBy } from './shared_constants';
import { INTERNAL_LABEL_KEYS } from './monitors_table/monitors_table_helpers';
import './alerting.scss';

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
  anomaly: '#B8821C',
  pending: '#F5A700',
  acknowledged: '#006BB4',
  resolved: '#017D73',
  error: '#BD271E',
  silenced: '#98A2B3',
};
const STATE_HEALTH: Record<string, string> = {
  active: 'danger',
  anomaly: '#B8821C',
  pending: 'warning',
  acknowledged: 'primary',
  resolved: 'success',
  error: 'danger',
  silenced: 'default',
};
const ALERT_TYPE_COLORS: Record<string, string> = {
  alert: '#006BB4',
  anomaly: '#B8821C',
};
const ALERTS_HIDDEN_LABEL_KEYS = new Set([
  ...Array.from(INTERNAL_LABEL_KEYS),
  'anomaly_result_id',
  'detector_id',
  'source',
]);

// ============================================================================
// Helpers
// ============================================================================

function getMillis(value: string | number): number {
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function formatDurationBetween(
  startTime: string | number,
  endTime: string | number = Date.now()
): string {
  const start = typeof startTime === 'number' ? startTime : new Date(startTime).getTime();
  const end = typeof endTime === 'number' ? endTime : new Date(endTime).getTime();
  const ms = Math.max(0, end - start);
  if (ms < 60000) return '<1m';
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm';
  if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ' + (Math.floor(ms / 60000) % 60) + 'm';
  return Math.floor(ms / 86400000) + 'd ' + (Math.floor(ms / 3600000) % 24) + 'h';
}

function formatDuration(startTime: string | number): string {
  return formatDurationBetween(startTime);
}

// Cap on label-key facets rendered before the user expands the section.
// Show a truncated list with a `Show all (N)` toggle to reveal the rest.
// 10 fits the common case (severity / instance / job / namespace / etc.)
// on screen at once.
const LABEL_KEY_INITIAL_VISIBLE = 10;

const SEVERITY_SORT_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

// ============================================================================
// Alert Filter State
// ============================================================================

interface AlertFilterState {
  alertKind: string[];
  severity: string[];
  state: string[];
  labels: Record<string, string[]>;
}

interface AlertTableRow extends UnifiedAlertSummary {
  groupedOccurrences?: UnifiedAlertSummary[];
  occurrenceCount?: number;
}

const emptyAlertFilters = (): AlertFilterState => ({
  alertKind: [],
  severity: [],
  state: [],
  labels: {},
});

function getAlertKind(alert: UnifiedAlertSummary): string {
  return alert.alertKind || 'alert';
}

function getAlertDisplayState(alert: UnifiedAlertSummary): string {
  return getAlertKind(alert) === 'anomaly' ? 'anomaly' : alert.state;
}

function isGroupedAnomalyRow(row: AlertTableRow): boolean {
  return getAlertKind(row) === 'anomaly' && (row.occurrenceCount || 0) > 1;
}

function getRepresentativeAlert(row: AlertTableRow): UnifiedAlertSummary {
  return row.groupedOccurrences?.[0] || row;
}

function getAlertTimestamp(alert: UnifiedAlertSummary): number {
  const lastUpdated = getMillis(alert.lastUpdated || alert.startTime);
  if (Number.isFinite(lastUpdated)) return lastUpdated;
  const start = getMillis(alert.startTime);
  return Number.isFinite(start) ? start : 0;
}

function formatAlertDuration(alert: UnifiedAlertSummary): string {
  const start = getMillis(alert.startTime);
  const end = getMillis(alert.lastUpdated);
  if (getAlertKind(alert) === 'anomaly' && Number.isFinite(start) && Number.isFinite(end)) {
    return formatDurationBetween(start, end);
  }
  return alert.startTime ? formatDuration(alert.startTime) : '—';
}

function parseAnomalyNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatAnomalyMetric(value?: number): string {
  return value === undefined ? '—' : value.toFixed(2);
}

function formatEntityLabel(entity?: string): string {
  if (!entity) return '';
  const separator = entity.indexOf('=');
  if (separator < 0) return entity;
  const field = entity.slice(0, separator);
  const value = entity.slice(separator + 1);
  return field && value ? `${field}: ${value}` : entity;
}

function getAnomalyGroupKey(alert: UnifiedAlertSummary): string {
  const detectorId = alert.labels?.detector_id || alert.monitorId || alert.name;
  const entity = alert.labels?.entity || alert.name;
  return [alert.datasourceId, detectorId, entity].join('::');
}

function buildGroupedAnomalyRow(group: UnifiedAlertSummary[]): AlertTableRow {
  const sorted = [...group].sort((a, b) => getAlertTimestamp(b) - getAlertTimestamp(a));
  const latest = sorted[0];
  const detectorName = latest.labels?.detector_name || latest.monitorId || latest.name;
  const entityLabel = formatEntityLabel(latest.labels?.entity);
  const grades = sorted
    .map((occurrence) => parseAnomalyNumber(occurrence.annotations?.anomaly_grade))
    .filter((value): value is number => value !== undefined);
  const maxGrade = grades.length > 0 ? Math.max(...grades) : undefined;
  const worstSeverity = sorted.reduce((current, occurrence) => {
    const currentOrder = SEVERITY_SORT_ORDER[current.severity] ?? 5;
    const nextOrder = SEVERITY_SORT_ORDER[occurrence.severity] ?? 5;
    return nextOrder < currentOrder ? occurrence : current;
  }, latest).severity;
  const count = sorted.length;

  return {
    ...latest,
    id: `anomaly-group-${getAnomalyGroupKey(latest)}`,
    name: entityLabel ? `${detectorName} - ${entityLabel}` : detectorName,
    severity: worstSeverity,
    startTime: latest.startTime,
    lastUpdated: latest.lastUpdated,
    message: i18n.translate('observability.alerting.alertsDashboard.groupedAnomalyMessage', {
      defaultMessage:
        '{count} anomaly {count, plural, one {occurrence} other {occurrences}} · max grade {maxGrade} · latest {latestTime}',
      values: {
        count,
        maxGrade: formatAnomalyMetric(maxGrade),
        latestTime: new Date(latest.lastUpdated || latest.startTime).toLocaleString(),
      },
    }),
    groupedOccurrences: sorted,
    occurrenceCount: count,
  };
}

function groupAnomalyAlerts(alerts: UnifiedAlertSummary[]): AlertTableRow[] {
  const rows: AlertTableRow[] = [];
  const anomalyGroups = new Map<string, UnifiedAlertSummary[]>();

  for (const alert of alerts) {
    if (getAlertKind(alert) !== 'anomaly') {
      rows.push(alert);
      continue;
    }

    const key = getAnomalyGroupKey(alert);
    const group = anomalyGroups.get(key) || [];
    group.push(alert);
    anomalyGroups.set(key, group);
  }

  for (const group of anomalyGroups.values()) {
    rows.push(group.length > 1 ? buildGroupedAnomalyRow(group) : group[0]);
  }

  return rows.sort((a, b) => getAlertTimestamp(b) - getAlertTimestamp(a));
}

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
  items: AlertTableRow[];
  columns: Array<EuiBasicTableColumn<AlertTableRow>>;
  loading: boolean;
  message: React.ReactNode;
  itemIdToExpandedRowMap: Record<string, React.ReactNode>;
}

const AlertsTable = React.memo(
  ({ items, columns, loading, message, itemIdToExpandedRowMap }: AlertsTableProps) => (
    <div className="altAlertsTable">
      <EuiInMemoryTable
        items={items}
        itemId="id"
        columns={columns}
        loading={loading}
        pagination={{ initialPageSize: 20, pageSizeOptions: [10, 20, 50, 100] }}
        sorting={{ sort: { field: 'startTime', direction: 'desc' } }}
        message={message}
        itemIdToExpandedRowMap={itemIdToExpandedRowMap}
      />
    </div>
  )
);

function renderGroupedAnomalyOccurrences(
  row: AlertTableRow,
  onViewDetail: (alert: UnifiedAlertSummary) => void
): React.ReactNode {
  const occurrences = row.groupedOccurrences || [];
  const total = occurrences.length;

  return (
    <EuiSplitPanel.Outer
      hasShadow={false}
      hasBorder
      color="plain"
      style={{ width: '100%' }}
      data-test-subj={`groupedAnomalyOccurrences-${row.id}`}
    >
      <EuiSplitPanel.Inner color="subdued" paddingSize="s">
        <EuiText size="s">
          <strong>
            <FormattedMessage
              id="observability.alerting.alertsDashboard.groupedAnomalyOccurrencesTitle"
              defaultMessage="{count} occurrences for {alertName}"
              values={{ count: total, alertName: row.name }}
            />
          </strong>
        </EuiText>
      </EuiSplitPanel.Inner>
      <EuiSplitPanel.Inner paddingSize="s" className="altGroupedOccurrencesBody">
        <EuiFlexGroup direction="column" gutterSize="s">
          {occurrences.map((occurrence, index) => {
            const occurrenceNumber = total - index;
            const timestamp = new Date(
              occurrence.lastUpdated || occurrence.startTime
            ).toLocaleString();

            return (
              <EuiFlexItem key={occurrence.id}>
                <EuiPanel
                  paddingSize="s"
                  hasShadow={false}
                  hasBorder
                  color={index === 0 ? 'subdued' : 'plain'}
                >
                  <div className="altGroupedOccurrenceGrid">
                    <div className="altGroupedOccurrenceCell" />
                    <div className="altGroupedOccurrenceCell altGroupedOccurrenceAlertCell">
                      <EuiButtonEmpty
                        size="xs"
                        flush="left"
                        iconType="inspect"
                        onClick={() => onViewDetail(occurrence)}
                      >
                        <FormattedMessage
                          id="observability.alerting.alertsDashboard.groupedAnomalyOccurrenceAction"
                          defaultMessage="Occurrence {occurrenceNumber} of {total}"
                          values={{ occurrenceNumber, total }}
                        />
                      </EuiButtonEmpty>
                    </div>
                    <div className="altGroupedOccurrenceCell" />
                    <div className="altGroupedOccurrenceCell altGroupedOccurrenceMessageCell">
                      {occurrence.message && (
                        <EuiText size="xs" color="subdued" className="altGroupedOccurrenceMessage">
                          {occurrence.message}
                        </EuiText>
                      )}
                    </div>
                    <div className="altGroupedOccurrenceCell">
                      <EuiToolTip content={timestamp}>
                        <span style={{ fontSize: 12 }}>
                          <FormattedMessage
                            id="observability.alerting.alertsDashboard.groupedAnomalyStartedAgo"
                            defaultMessage="{duration} ago"
                            values={{ duration: formatDuration(occurrence.startTime) }}
                          />
                        </span>
                      </EuiToolTip>
                    </div>
                    <div className="altGroupedOccurrenceCell">
                      <EuiText size="xs">{formatAlertDuration(occurrence)}</EuiText>
                    </div>
                    <div className="altGroupedOccurrenceCell" />
                  </div>
                </EuiPanel>
              </EuiFlexItem>
            );
          })}
        </EuiFlexGroup>
      </EuiSplitPanel.Inner>
    </EuiSplitPanel.Outer>
  );
}

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
  /** Cap on concurrently selected datasources (from uiSettings). */
  maxDatasources: number;
  /** Callback fired when user tries to exceed `maxDatasources`. */
  onDatasourceCapReached: () => void;
  /**
   * Total number of rules across the selected datasources. `-1` means rules have
   * not yet been fetched; `0` means none exist. Drives the "no rules" empty state.
   */
  rulesTotal: number;
  /** Default datasource ids from advanced settings; shown in the "no datasource" empty state. */
  defaultDatasources: string[];
  /** Switch to the Rules tab (used by the "No rules" empty state CTA). */
  onGoToRules: () => void;
  /** Picker start resolved to epoch ms (resolved once by the parent). */
  startMs: number;
  /** Picker end resolved to epoch ms (resolved once by the parent). */
  endMs: number;
  /** Date-math start string passed to EuiSuperDatePicker (parent owns persistence). */
  pickerStart: string;
  /** Date-math end string passed to EuiSuperDatePicker (parent owns persistence). */
  pickerEnd: string;
  /** Fires when the user picks a new range. */
  onTimeChange: (range: { start: string; end: string }) => void;
  /** Fires when the user clicks the picker's refresh button. */
  onRefresh: (range: { start: string; end: string }) => void;
  /**
   * Set by the parent when any backend reported a hard cap on returned
   * alerts (e.g. the OpenSearch 1000-alert post-filter cap). Drives a
   * warning callout near the timeline telling the user to narrow the
   * range.
   */
  truncated?: boolean;
  /**
   * Per-datasource hints from the unified fetch, used to surface backend
   * fallbacks (e.g. Prometheus empty-matrix → legacy /alerts active-only).
   * Rendered as a callout above the timeline.
   */
  fallbackHints?: Array<{ datasourceName: string; fallback: DatasourceFetchFallback }>;
}

export const AlertsDashboard: React.FC<AlertsDashboardProps> = ({
  alerts,
  datasources,
  loading,
  onViewDetail,
  onAcknowledge,
  selectedDsIds,
  onDatasourceChange,
  maxDatasources,
  onDatasourceCapReached,
  rulesTotal,
  defaultDatasources,
  onGoToRules,
  startMs,
  endMs,
  pickerStart,
  pickerEnd,
  onTimeChange,
  onRefresh,
  truncated,
  fallbackHints,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<AlertFilterState>(emptyAlertFilters());
  const { toggleFacetCollapse, isCollapsed: isFacetCollapsed } = useFacetCollapse();
  const [labelSearch, setLabelSearch] = useState('');
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});

  // Build selectable datasource entries for the filter facet — alpha by name
  const datasourceEntries = useMemo(
    () =>
      datasources
        .map((ds) => ({ id: ds.id, label: ds.name }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
    [datasources]
  );

  // Per-name icon map so the datasource facet renders a leading
  // OpenSearch / Prometheus glyph next to each option. Keyed by name
  // because that's the option key passed to FacetFilterGroup.
  const datasourceIconMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ds of datasources) {
      map[ds.name] = ds.type === 'prometheus' ? 'logoPrometheus' : 'logoOpenSearch';
    }
    return map;
  }, [datasources]);

  // Unique values for facets
  const uniqueSeverities = useMemo(() => collectAlertUniqueValues(alerts, (a) => a.severity), [
    alerts,
  ]);
  const uniqueStates = useMemo(() => collectAlertUniqueValues(alerts, getAlertDisplayState), [
    alerts,
  ]);
  const uniqueAlertKinds = useMemo(() => collectAlertUniqueValues(alerts, getAlertKind), [alerts]);
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
      alertKind: {},
      severity: {},
      state: {},
    };
    for (const a of searchMatched) {
      const alertKind = getAlertKind(a);
      const state = getAlertDisplayState(a);
      counts.alertKind[alertKind] = (counts.alertKind[alertKind] || 0) + 1;
      counts.severity[a.severity] = (counts.severity[a.severity] || 0) + 1;
      counts.state[state] = (counts.state[state] || 0) + 1;
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
    let count = filters.alertKind.length + filters.severity.length + filters.state.length;
    for (const vals of Object.values(filters.labels)) count += vals.length;
    return count;
  }, [filters]);

  // Filtered + sorted alerts for the table
  const filteredAlerts = useMemo(() => {
    const baseFilteredAlerts = filterAlerts(alerts, {
      alertKind: filters.alertKind.length > 0 ? filters.alertKind : undefined,
      severity: filters.severity.length > 0 ? filters.severity : undefined,
      labels: Object.keys(filters.labels).length > 0 ? filters.labels : undefined,
      search: searchQuery || undefined,
    });
    if (filters.state.length === 0) return baseFilteredAlerts;
    return baseFilteredAlerts.filter((alert) =>
      filters.state.includes(getAlertDisplayState(alert))
    );
  }, [alerts, searchQuery, filters]);

  const groupedTableRows = useMemo(() => groupAnomalyAlerts(filteredAlerts), [filteredAlerts]);
  const groupedOccurrenceRows = useMemo(() => {
    const rows: Record<string, React.ReactNode> = {};
    for (const row of groupedTableRows) {
      if (expandedGroupIds[row.id] && isGroupedAnomalyRow(row)) {
        rows[row.id] = renderGroupedAnomalyOccurrences(row, onViewDetail);
      }
    }
    return rows;
  }, [expandedGroupIds, groupedTableRows, onViewDetail]);

  // Clearing the datasource filter must also clear dependent facets and the
  // search box because severity/state/label options are derived from the
  // currently selected datasources' alerts — leaving stale selections (or a
  // stale search query) would filter against values that no longer exist in
  // the visible dataset. Mirrors clearAllFilters in monitors_table/index.tsx
  // so the cascade-clear behavior is consistent across tabs.
  const clearDependentFilters = () => {
    setFilters(emptyAlertFilters());
    setSearchQuery('');
  };

  const updateFilter = <K extends keyof AlertFilterState>(key: K, value: AlertFilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
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
    colorMap?: Record<string, string>,
    defaultCollapsed = false,
    showOptionCount = false
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
      showOptionCount={showOptionCount}
      isCollapsed={isFacetCollapsed(id, defaultCollapsed)}
      onToggleCollapse={(facetId) => toggleFacetCollapse(facetId, defaultCollapsed)}
    />
  );

  // Table columns — memoized so `AlertsTable`'s React.memo shallow-compare
  // doesn't invalidate on every parent re-render.
  const columns = useMemo<Array<EuiBasicTableColumn<AlertTableRow>>>(
    () => [
      {
        field: 'severity',
        name: i18n.translate('observability.alerting.alertsDashboard.column.sev', {
          defaultMessage: 'Sev',
        }),
        width: '60px',
        sortable: (a: AlertTableRow) => SEVERITY_SORT_ORDER[a.severity] ?? 5,
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
        name: i18n.translate('observability.alerting.alertsDashboard.column.alert', {
          defaultMessage: 'Alert',
        }),
        sortable: true,
        truncateText: true,
        className: 'altAlertColumn',
        render: (name: string, alert: AlertTableRow) => {
          const representative = getRepresentativeAlert(alert);
          const isGrouped = isGroupedAnomalyRow(alert);
          const isExpanded = Boolean(expandedGroupIds[alert.id]);
          const iconType =
            alert.datasourceType === 'prometheus' ? 'logoPrometheus' : 'logoOpenSearch';
          const toggleExpandedGroup = () => {
            setExpandedGroupIds((prev) => ({
              ...prev,
              [alert.id]: !prev[alert.id],
            }));
          };
          // `iconType` on EuiButtonEmpty puts the icon in the button's
          // dedicated icon slot (vertically centered with the label). Inlining
          // <EuiIcon> as a child instead lands inside the .euiButtonEmpty__text
          // flex slot which has no `align-items: center`, so it sits at the
          // top-left of the row.
          return (
            <EuiFlexGroup
              className="altAlertCell"
              gutterSize="xs"
              alignItems="center"
              responsive={false}
              wrap={false}
            >
              <EuiFlexItem className="altAlertNameItem" grow={true}>
                <EuiToolTip content={name}>
                  <EuiButtonEmpty
                    className="altAlertNameButton"
                    size="xs"
                    flush="left"
                    iconType={iconType}
                    onClick={() =>
                      isGrouped ? toggleExpandedGroup() : onViewDetail(representative)
                    }
                    style={{ fontWeight: 500 }}
                  >
                    <span className="altAlertNameText">{name}</span>
                  </EuiButtonEmpty>
                </EuiToolTip>
              </EuiFlexItem>
              {isGrouped && (
                <EuiFlexItem className="altAlertOccurrencesItem" grow={false}>
                  <EuiButtonEmpty
                    className="altAlertOccurrencesButton"
                    size="xs"
                    flush="left"
                    color="text"
                    iconType={isExpanded ? 'arrowDown' : 'arrowRight'}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleExpandedGroup();
                    }}
                    aria-label={i18n.translate(
                      'observability.alerting.alertsDashboard.groupedAnomalyOccurrenceToggleAriaLabel',
                      {
                        defaultMessage: 'Show or hide grouped anomaly occurrences',
                      }
                    )}
                  >
                    <FormattedMessage
                      id="observability.alerting.alertsDashboard.groupedAnomalyOccurrenceBadge"
                      defaultMessage="{count} occurrences"
                      values={{ count: alert.occurrenceCount }}
                    />
                  </EuiButtonEmpty>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          );
        },
      },
      {
        field: 'state',
        name: i18n.translate('observability.alerting.alertsDashboard.column.state', {
          defaultMessage: 'State',
        }),
        width: '140px',
        sortable: (alert: AlertTableRow) => getAlertDisplayState(alert),
        render: (_state: string, alert: AlertTableRow) => {
          const state = getAlertDisplayState(alert);
          return <EuiHealth color={STATE_HEALTH[state] || 'subdued'}>{state}</EuiHealth>;
        },
      },
      {
        field: 'message',
        name: i18n.translate('observability.alerting.alertsDashboard.column.message', {
          defaultMessage: 'Message',
        }),
        truncateText: true,
        render: (msg: string) => (
          <EuiText size="xs" color="subdued">
            {msg || '—'}
          </EuiText>
        ),
      },
      {
        field: 'startTime',
        name: i18n.translate('observability.alerting.alertsDashboard.column.started', {
          defaultMessage: 'Started',
        }),
        width: '120px',
        sortable: true,
        render: (ts: string) => {
          if (!ts) return <EuiText size="xs">---</EuiText>;
          const abs = new Date(ts).toLocaleString();
          return (
            <EuiToolTip content={abs}>
              <span style={{ fontSize: 12 }}>
                <FormattedMessage
                  id="observability.alerting.alertsDashboard.startedAgo"
                  defaultMessage="{duration} ago"
                  values={{ duration: formatDuration(ts) }}
                />
              </span>
            </EuiToolTip>
          );
        },
      },
      {
        field: 'startTime',
        name: i18n.translate('observability.alerting.alertsDashboard.column.duration', {
          defaultMessage: 'Duration',
        }),
        width: '90px',
        render: (_ts: string, alert: AlertTableRow) => (
          <EuiText size="xs">{formatAlertDuration(getRepresentativeAlert(alert))}</EuiText>
        ),
      },
      {
        name: i18n.translate('observability.alerting.alertsDashboard.column.actions', {
          defaultMessage: 'Actions',
        }),
        width: '150px',
        render: (alert: AlertTableRow) => {
          const representative = getRepresentativeAlert(alert);
          return (
            <EuiFlexGroup gutterSize="xs" responsive={false} wrap={false} alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={
                    getAlertKind(alert) === 'anomaly'
                      ? i18n.translate(
                          'observability.alerting.alertsDashboard.viewAnomalyDetailsTooltip',
                          {
                            defaultMessage: 'View anomaly details',
                          }
                        )
                      : i18n.translate(
                          'observability.alerting.alertsDashboard.viewDetailsTooltip',
                          {
                            defaultMessage: 'View details',
                          }
                        )
                  }
                >
                  <EuiButtonIcon
                    iconType="inspect"
                    aria-label={i18n.translate(
                      'observability.alerting.alertsDashboard.viewAriaLabel',
                      {
                        defaultMessage: 'View',
                      }
                    )}
                    size="s"
                    onClick={() => onViewDetail(representative)}
                  />
                </EuiToolTip>
              </EuiFlexItem>
              {getAlertKind(alert) === 'alert' &&
                alert.state === 'active' &&
                alert.datasourceType !== 'prometheus' && (
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      iconType="check"
                      size="xs"
                      color="primary"
                      onClick={() => onAcknowledge(alert.id)}
                    >
                      <FormattedMessage
                        id="observability.alerting.alertsDashboard.ackButton"
                        defaultMessage="Ack"
                      />
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                )}
            </EuiFlexGroup>
          );
        },
      },
    ],
    [expandedGroupIds, onAcknowledge, onViewDetail]
  );

  // Chart-area empty state mode. Cascade:
  //   'no-ds'    — user hasn't selected any datasource
  //   'no-rules' — DS selected, but no rules exist across them
  //   'no-alerts' — rules exist, but none fired in the current time range
  //   null — render the timeline
  const emptyMode: 'no-ds' | 'no-rules' | 'no-alerts' | null = !loading
    ? selectedDsIds.length === 0
      ? 'no-ds'
      : rulesTotal === 0
      ? 'no-rules'
      : alerts.length === 0
      ? 'no-alerts'
      : null
    : null;

  return (
    <EuiResizableContainer className="altResizableContainer">
      {(EuiResizablePanel, EuiResizableButton, { togglePanel }) => (
        <>
          <EuiResizablePanel
            id="alerts-filters-panel"
            initialSize={15}
            minSize="10%"
            mode={['custom', { position: 'top' }]}
            paddingSize="none"
            scrollable={false}
            className="altFiltersPanel"
          >
            <EuiPanel className="altFiltersInner">
              <EuiFlexGroup
                gutterSize="xs"
                alignItems="center"
                responsive={false}
                justifyContent="spaceBetween"
              >
                <EuiFlexItem>
                  <EuiText size="xs">
                    <strong>
                      <FormattedMessage
                        id="observability.alerting.alertsDashboard.filtersHeader"
                        defaultMessage="Filters"
                      />
                    </strong>
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonIcon
                    iconType="menuLeft"
                    onClick={() => togglePanel?.('alerts-filters-panel', { direction: 'left' })}
                    aria-label={i18n.translate(
                      'observability.alerting.alertsDashboard.collapseFiltersAriaLabel',
                      {
                        defaultMessage: 'Collapse filters',
                      }
                    )}
                    data-test-subj="alertsFiltersPanelToggle"
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
              <div className="altFiltersBody">
                <FacetFilterGroup
                  id="datasource"
                  label={i18n.translate('observability.alerting.alertsDashboard.facet.datasource', {
                    defaultMessage: 'Datasource',
                  })}
                  iconMap={datasourceIconMap}
                  options={datasourceEntries.map((e) => e.label)}
                  selected={selectedDsIds
                    .map((id) => datasourceEntries.find((e) => e.id === id)?.label || '')
                    .filter(Boolean)}
                  onChange={(labels) => {
                    const ids = labels
                      .map((l) => datasourceEntries.find((e) => e.label === l)?.id)
                      .filter(Boolean) as string[];
                    onDatasourceChange(ids);
                    // Clearing datasource invalidates the other facet options
                    // (severity/state/labels are derived from the selected
                    // datasources' alerts), so wipe dependent filters.
                    if (ids.length === 0) clearDependentFilters();
                  }}
                  counts={countBy(
                    datasourceEntries.filter(
                      (e) => selectedDsIds.includes(e.id) || selectedDsIds.length === 0
                    ),
                    (e) => e.label
                  )}
                  searchable
                  showCounts={false}
                  initialVisible={5}
                  maxSelected={maxDatasources}
                  onCapReached={onDatasourceCapReached}
                  searchAriaLabel={i18n.translate(
                    'observability.alerting.alertsDashboard.searchDatasourcesAriaLabel',
                    {
                      defaultMessage: 'Search datasources',
                    }
                  )}
                  checkedFirst
                  isCollapsed={isFacetCollapsed('datasource')}
                  onToggleCollapse={toggleFacetCollapse}
                />

                {renderFacetGroup(
                  'type',
                  i18n.translate('observability.alerting.alertsDashboard.facet.type', {
                    defaultMessage: 'Type',
                  }),
                  uniqueAlertKinds,
                  filters.alertKind,
                  (v) => updateFilter('alertKind', v),
                  facetCounts.counts.alertKind,
                  ALERT_TYPE_COLORS
                )}
                {renderFacetGroup(
                  'severity',
                  i18n.translate('observability.alerting.alertsDashboard.facet.severity', {
                    defaultMessage: 'Severity',
                  }),
                  uniqueSeverities,
                  filters.severity,
                  (v) => updateFilter('severity', v),
                  facetCounts.counts.severity,
                  SEVERITY_COLORS
                )}
                {renderFacetGroup(
                  'state',
                  i18n.translate('observability.alerting.alertsDashboard.facet.state', {
                    defaultMessage: 'State',
                  }),
                  uniqueStates,
                  filters.state,
                  (v) => updateFilter('state', v),
                  facetCounts.counts.state,
                  STATE_COLORS
                )}
                {(() => {
                  const visibleLabelKeys = labelKeys.filter(
                    (k) => !ALERTS_HIDDEN_LABEL_KEYS.has(k)
                  );
                  if (visibleLabelKeys.length === 0) return null;
                  const q = labelSearch.trim().toLowerCase();
                  const matchedLabelKeys = q
                    ? visibleLabelKeys.filter(
                        (k) =>
                          k.toLowerCase().includes(q) ||
                          collectAlertLabelValues(alerts, k).some((v) =>
                            v.toLowerCase().includes(q)
                          )
                      )
                    : visibleLabelKeys;
                  const cappedLabelKeys = showAllLabels
                    ? matchedLabelKeys
                    : matchedLabelKeys.slice(0, LABEL_KEY_INITIAL_VISIBLE);
                  const hasOverflow = matchedLabelKeys.length > LABEL_KEY_INITIAL_VISIBLE;
                  return (
                    <>
                      <EuiHorizontalRule margin="s" />
                      <EuiText size="xs" color="subdued" style={{ marginBottom: 6 }}>
                        <strong>
                          <FormattedMessage
                            id="observability.alerting.alertsDashboard.labelsHeader"
                            defaultMessage="Labels"
                          />
                        </strong>
                      </EuiText>
                      <EuiFieldSearch
                        compressed
                        fullWidth
                        placeholder={i18n.translate(
                          'observability.alerting.alertsDashboard.searchLabelsPlaceholder',
                          {
                            defaultMessage: 'Search labels',
                          }
                        )}
                        value={labelSearch}
                        onChange={(e) => setLabelSearch(e.target.value)}
                        aria-label={i18n.translate(
                          'observability.alerting.alertsDashboard.searchLabelsAriaLabel',
                          {
                            defaultMessage: 'Search labels',
                          }
                        )}
                        data-test-subj="alertsLabelsSearch"
                      />
                      <EuiSpacer size="xs" />
                      {cappedLabelKeys.map((key) =>
                        renderFacetGroup(
                          `label:${key}`,
                          key,
                          collectAlertLabelValues(alerts, key),
                          filters.labels[key] || [],
                          (v) => updateLabelFilter(key, v),
                          facetCounts.labelCounts[key] || {},
                          undefined,
                          true,
                          true
                        )
                      )}
                      {matchedLabelKeys.length === 0 && (
                        <EuiText size="xs" color="subdued">
                          <FormattedMessage
                            id="observability.alerting.alertsDashboard.noLabelMatches"
                            defaultMessage="No labels match"
                          />
                        </EuiText>
                      )}
                      {hasOverflow && (
                        <EuiLink
                          color="primary"
                          onClick={() => setShowAllLabels((v) => !v)}
                          data-test-subj="alertsLabelsShowAll"
                        >
                          <EuiText size="xs">
                            {showAllLabels ? (
                              <FormattedMessage
                                id="observability.alerting.alertsDashboard.showLessLabels"
                                defaultMessage="Show less"
                              />
                            ) : (
                              <FormattedMessage
                                id="observability.alerting.alertsDashboard.showAllLabels"
                                defaultMessage="Show all ({count})"
                                values={{ count: matchedLabelKeys.length }}
                              />
                            )}
                          </EuiText>
                        </EuiLink>
                      )}
                    </>
                  );
                })()}
              </div>
            </EuiPanel>
          </EuiResizablePanel>

          <EuiResizableButton />

          <EuiResizablePanel
            initialSize={85}
            minSize="400px"
            paddingSize="none"
            scrollable={false}
            className="altContentPanel"
          >
            {
              <>
                {/* ---- Backend hints / fallbacks ---- */}
                {/* Surfaced here (above the timeline) because both hints      */}
                {/* directly explain what the chart and table are showing:     */}
                {/*   - `truncated` → the backend capped results (OS 1000      */}
                {/*     post-filter cap) so the chart is missing bars and the  */}
                {/*     table row count is lower than reality.                 */}
                {/*   - `fallbackHints` → a Prometheus datasource returned no  */}
                {/*     historical matrix and fell back to the legacy         */}
                {/*     `/api/v1/alerts` endpoint, which is active-only and   */}
                {/*     does not reflect the selected time range.             */}
                {truncated && (
                  <>
                    <EuiCallOut
                      title={i18n.translate(
                        'observability.alerting.dashboard.truncatedCallout.title',
                        {
                          defaultMessage: 'Search incomplete — too many alerts to scan',
                        }
                      )}
                      color="warning"
                      iconType="alert"
                      size="s"
                      data-test-subj="alertsTruncatedCallout"
                    >
                      <p>
                        <FormattedMessage
                          id="observability.alerting.dashboard.truncatedCallout.body"
                          defaultMessage="Narrow the time range or refine your filters and try again."
                        />
                      </p>
                    </EuiCallOut>
                    <EuiSpacer size="s" />
                  </>
                )}
                {fallbackHints && fallbackHints.length > 0 && (
                  <>
                    <EuiCallOut
                      title={i18n.translate(
                        'observability.alerting.dashboard.fallbackCallout.title',
                        {
                          defaultMessage: 'Showing current alerts only',
                        }
                      )}
                      color="warning"
                      iconType="alert"
                      size="s"
                      data-test-subj="alertsFallbackCallout"
                    >
                      {fallbackHints.map((h, i) => (
                        <p key={i}>
                          <FormattedMessage
                            id="observability.alerting.dashboard.fallbackCallout.entry"
                            defaultMessage="{datasourceName}: historical alert data unavailable; showing currently active alerts instead ({fallback})."
                            values={{
                              datasourceName: <strong>{h.datasourceName}</strong>,
                              fallback: h.fallback,
                            }}
                          />
                        </p>
                      ))}
                    </EuiCallOut>
                    <EuiSpacer size="s" />
                  </>
                )}

                {/* ---- Visualization Row ---- */}
                <EuiFlexGroup gutterSize="m" responsive={true} className="altVizRow">
                  <EuiFlexItem grow={3} className="altVizItem">
                    <EuiPanel paddingSize="m" hasBorder className="altVizPanel">
                      {/* Title left, time picker right. Always rendered so the */}
                      {/* picker stays reachable from the empty states (e.g.    */}
                      {/* "No alerts in range" → user widens the range).        */}
                      <EuiFlexGroup
                        gutterSize="s"
                        alignItems="center"
                        responsive={false}
                        justifyContent="spaceBetween"
                      >
                        <EuiFlexItem grow={false}>
                          <EuiTitle size="xxs">
                            <h4>
                              <FormattedMessage
                                id="observability.alerting.alertsDashboard.alertTimelineTitle"
                                defaultMessage="Alerts timeline"
                              />
                            </h4>
                          </EuiTitle>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          {/* `EuiSuperDatePicker` doesn't forward `data-test-subj`
                              to its rendered control, so anchor it on a wrapper
                              div for stable Cypress / functional selectors. */}
                          <div data-test-subj="alertManagerDatePicker">
                            <EuiSuperDatePicker
                              compressed
                              start={pickerStart}
                              end={pickerEnd}
                              onTimeChange={onTimeChange}
                              onRefresh={onRefresh}
                            />
                          </div>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                      <EuiSpacer size="s" />
                      {emptyMode === 'no-ds' ? (
                        <EuiEmptyPrompt
                          iconType="database"
                          title={
                            <h4>
                              <FormattedMessage
                                id="observability.alerting.alertsDashboard.noDatasourceTitle"
                                defaultMessage="No datasource selected"
                              />
                            </h4>
                          }
                          body={
                            <p>
                              <FormattedMessage
                                id="observability.alerting.alertsDashboard.noDatasourceBody"
                                defaultMessage="Select a datasource from the filter panel on the left to view alerts."
                              />
                            </p>
                          }
                          actions={
                            defaultDatasources.length > 0 ? (
                              <EuiButtonEmpty
                                size="s"
                                onClick={() => onDatasourceChange(defaultDatasources)}
                                data-test-subj="alertsEmptyResetDefaults"
                              >
                                <FormattedMessage
                                  id="observability.alerting.alertsDashboard.resetToDefaultDatasources"
                                  defaultMessage="Reset to default datasources"
                                />
                              </EuiButtonEmpty>
                            ) : undefined
                          }
                        />
                      ) : emptyMode === 'no-rules' ? (
                        <EuiEmptyPrompt
                          iconType="bell"
                          title={
                            <h4>
                              <FormattedMessage
                                id="observability.alerting.alertsDashboard.noRulesTitle"
                                defaultMessage="No rules or detectors have been created"
                              />
                            </h4>
                          }
                          body={
                            <p>
                              <FormattedMessage
                                id="observability.alerting.alertsDashboard.noRulesBody"
                                defaultMessage="The selected datasource has no monitors or anomaly detectors configured. Create one to start receiving alerts."
                              />
                            </p>
                          }
                          actions={
                            <EuiButton
                              size="s"
                              fill
                              onClick={onGoToRules}
                              data-test-subj="alertsEmptyGoToRules"
                            >
                              <FormattedMessage
                                id="observability.alerting.alertsDashboard.goToRules"
                                defaultMessage="Go to Rules"
                              />
                            </EuiButton>
                          }
                        />
                      ) : emptyMode === 'no-alerts' ? (
                        <EuiEmptyPrompt
                          iconType="checkInCircleFilled"
                          iconColor="success"
                          title={
                            <h4>
                              <FormattedMessage
                                id="observability.alerting.alertsDashboard.noAlertsTitle"
                                defaultMessage="No alerts in the selected time range"
                              />
                            </h4>
                          }
                          body={
                            <p>
                              <FormattedMessage
                                id="observability.alerting.alertsDashboard.noAlertsBody"
                                defaultMessage="Try expanding the time range to see more alert history."
                              />
                            </p>
                          }
                        />
                      ) : (
                        <AlertTimeline alerts={filteredAlerts} startMs={startMs} endMs={endMs} />
                      )}
                    </EuiPanel>
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiSpacer size="s" />

                {/* ---- Search + Table ---- */}
                <EuiPanel paddingSize="m" hasBorder className="altTablePanel">
                  <EuiTitle size="xs">
                    <h2>
                      <FormattedMessage
                        id="observability.alerting.alertsDashboard.allAlertsTitle"
                        defaultMessage="All Alerts"
                      />
                    </h2>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <EuiFieldSearch
                    placeholder={i18n.translate(
                      'observability.alerting.alertsDashboard.searchPlaceholder',
                      {
                        defaultMessage: 'Search alerts by name, message, or label...',
                      }
                    )}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    isClearable
                    fullWidth
                    aria-label={i18n.translate(
                      'observability.alerting.alertsDashboard.searchAlertsAriaLabel',
                      {
                        defaultMessage: 'Search alerts',
                      }
                    )}
                  />
                  <EuiSpacer size="s" />
                  <EuiText size="s">
                    <FormattedMessage
                      id="observability.alerting.alertsDashboard.alertsCount"
                      defaultMessage="{count} {count, plural, one {row} other {rows}}"
                      values={{ count: groupedTableRows.length }}
                    />
                    {groupedTableRows.length !== filteredAlerts.length && (
                      <span>
                        {' '}
                        ·{' '}
                        <FormattedMessage
                          id="observability.alerting.alertsDashboard.groupedAlertsCount"
                          defaultMessage="{count} alerts grouped"
                          values={{ count: filteredAlerts.length }}
                        />
                      </span>
                    )}
                    {activeFilterCount > 0 && (
                      <span>
                        {' '}
                        ·{' '}
                        <FormattedMessage
                          id="observability.alerting.alertsDashboard.filtersCount"
                          defaultMessage="{count} {count, plural, one {filter} other {filters}}"
                          values={{ count: activeFilterCount }}
                        />
                      </span>
                    )}
                  </EuiText>
                  <EuiSpacer size="s" />
                  <AlertsTable
                    items={groupedTableRows}
                    columns={columns}
                    loading={loading}
                    itemIdToExpandedRowMap={groupedOccurrenceRows}
                    message={
                      searchQuery || activeFilterCount > 0
                        ? i18n.translate(
                            'observability.alerting.alertsDashboard.noAlertsMatchFilters',
                            {
                              defaultMessage: 'No alerts match your filters',
                            }
                          )
                        : i18n.translate('observability.alerting.alertsDashboard.noAlerts', {
                            defaultMessage: 'No alerts',
                          })
                    }
                  />
                </EuiPanel>
              </>
            }
          </EuiResizablePanel>
        </>
      )}
    </EuiResizableContainer>
  );
};
