/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitors table column definitions + cell renderers. Extracted from the
 * monolithic `monitors_table.tsx` so the column-by-column `if/else` branch
 * lives outside the main component and can evolve (or be tested) without
 * touching state wiring.
 *
 * Contents:
 *   - `ColumnId` — union of the rendered columns
 *   - `DEFAULT_VISIBLE` — columns shown on first render
 *   - `buildTableColumns` — factory that returns the EuiInMemoryTable column
 *     array, taking the bits of component state the cell renderers need as
 *     explicit arguments (no closure over `this`)
 */
import React from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLoadingSpinner,
  EuiTextColor,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import moment from 'moment';
import {
  MonitorHealthStatus,
  MonitorStatus,
  MonitorType,
  UnifiedAlertSeverity,
  UnifiedRuleSummary,
} from '../../../../common/types/alerting';
import {
  cloudWatchStateToHealth,
  cloudWatchStateToStatus,
  HEALTH_COLORS,
  isDetectorRule,
  isForecasterRule,
  SEVERITY_COLORS,
  STATUS_COLORS,
  TYPE_LABELS,
} from '../shared_constants';
import { TruncatedLabel } from '../../common/truncated_label';
import { getCloudWatchStateLabel, getMonitorStateLabel, getSeverityLabel } from '../enum_labels';
import { DEFAULT_WIDTHS } from './resizable_columns';
import { isPending } from './pending_rules';
import type { CloudWatchWindowState } from '../hooks/use_cloudwatch_states_at';

/** Tint for the `CW: <state>` badge shown alongside the unified status. */
const CLOUDWATCH_STATE_BADGE_COLOR: Record<string, string> = {
  ALARM: 'danger',
  OK: 'success',
  INSUFFICIENT_DATA: 'warning',
};

// ============================================================================
// Column Definitions
// ============================================================================

export type ColumnId =
  'name' | 'status' | 'severity' | 'monitorType' | 'healthStatus' | 'datasource';

export const DEFAULT_VISIBLE: ColumnId[] = [
  'name',
  'status',
  'severity',
  'monitorType',
  'healthStatus',
  'datasource',
];

export const isDetectorDefinition = (item: UnifiedRuleSummary): boolean => isDetectorRule(item);

export const isForecasterDefinition = (item: UnifiedRuleSummary): boolean => isForecasterRule(item);

// ============================================================================
// Column builder — factory producing the EuiInMemoryTable column array.
// Cell renderers close over the component state bits passed in (selectedIds,
// setSelectedMonitor, dsNameMap, columnWidths) but do NOT capture hooks or
// mutable refs directly.
// ============================================================================

export interface BuildTableColumnsParams {
  visibleColumns: Set<ColumnId>;
  filtered: UnifiedRuleSummary[];
  selectedIds: Set<string>;
  columnWidths: Record<string, number>;
  dsNameMap: Map<string, string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  setSelectedMonitor: (r: UnifiedRuleSummary) => void;
  /**
   * A CloudWatch row's state at the end of the Rules tab's window, when that window ends in the
   * past. Status and Health then show that state instead of the current one.
   */
  cloudWatchStateAt?: (r: UnifiedRuleSummary) => CloudWatchWindowState | undefined;
}

const formatAt = (ms: number) => moment(ms).format('M/D HH:mm');

/** "CloudWatch state at 9/24 14:00" (plus a caveat when the history read stopped short). */
function stateAtTooltip(at: CloudWatchWindowState): string {
  if (!at.state) {
    return i18n.translate('observability.alerting.monitorsTable.columns.cloudWatchStateAtUnknown', {
      defaultMessage:
        "CloudWatch keeps 30 days of alarm history, so the state at {time} isn't available.",
      values: { time: formatAt(at.atMs) },
    });
  }
  const label = i18n.translate('observability.alerting.monitorsTable.columns.cloudWatchStateAt', {
    defaultMessage: 'CloudWatch state at {time}',
    values: { time: formatAt(at.atMs) },
  });
  if (at.complete) return label;
  return `${label}. ${i18n.translate(
    'observability.alerting.monitorsTable.columns.cloudWatchStateAtPartial',
    { defaultMessage: 'Not all history loaded, so this may be the current state.' }
  )}`;
}

export function buildTableColumns({
  visibleColumns,
  filtered,
  selectedIds,
  columnWidths,
  dsNameMap,
  toggleSelect,
  toggleSelectAll,
  setSelectedMonitor,
  cloudWatchStateAt,
}: BuildTableColumnsParams): Array<Record<string, unknown>> {
  const w = (id: string) => `${columnWidths[id] || DEFAULT_WIDTHS[id] || 120}px`;
  // Pending optimistic rows aren't selectable (their synthetic id would 404),
  // so exclude them when deciding the header's "all selected" state.
  const selectable = filtered.filter((item) => !isPending(item));
  const allSelectableSelected =
    selectable.length > 0 && selectable.every((item) => selectedIds.has(item.id));

  const cols: Array<Record<string, unknown>> = [
    {
      field: '_select',
      name: (
        <input
          type="checkbox"
          checked={allSelectableSelected}
          disabled={selectable.length === 0}
          onChange={toggleSelectAll}
          aria-label={i18n.translate(
            'observability.alerting.monitorsTable.columns.selectAllAriaLabel',
            {
              defaultMessage: 'Select all rules',
            }
          )}
        />
      ),
      width: '32px',
      render: (_: unknown, item: UnifiedRuleSummary) => {
        return (
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            disabled={isPending(item)}
            onChange={() => toggleSelect(item.id)}
            aria-label={i18n.translate(
              'observability.alerting.monitorsTable.columns.selectRowAriaLabel',
              {
                defaultMessage: 'Select {name}',
                values: { name: item.name },
              }
            )}
          />
        );
      },
    },
  ];

  for (const colId of Array.from(visibleColumns)) {
    if (colId === 'name') {
      cols.push({
        field: 'name',
        name: i18n.translate('observability.alerting.monitorsTable.columns.name', {
          defaultMessage: 'Name',
        }),
        // Case-insensitive, so "always-in-alarm" sorts above "Observability Stack - …".
        sortable: (r: UnifiedRuleSummary) => (r.name || '').toLowerCase(),
        truncateText: true,
        width: w('name'),
        render: (name: string, item: UnifiedRuleSummary) => {
          const iconType =
            item.datasourceType === 'cloudwatch'
              ? 'logoAWS'
              : item.datasourceType === 'prometheus'
                ? 'logoPrometheus'
                : 'logoOpenSearch';
          // Avoid duplicating the group when the dedicated Rule Group column is visible
          const showGroupBadge =
            item.datasourceType === 'prometheus' && !!item.group && !visibleColumns.has('group');
          const showPartialAccess = !!item.cloudWatch?.partialAccess;
          return (
            <div>
              <EuiButtonEmpty
                size="xs"
                flush="left"
                color="primary"
                iconType={iconType}
                onClick={() => setSelectedMonitor(item)}
                aria-label={i18n.translate(
                  'observability.alerting.monitorsTable.columns.viewDetailsAriaLabel',
                  {
                    defaultMessage: 'View details for {name}',
                    values: { name },
                  }
                )}
              >
                <strong>{name}</strong>
              </EuiButtonEmpty>
              {showPartialAccess && (
                <EuiBadge color="hollow" style={{ fontSize: 10, marginLeft: 4 }}>
                  {i18n.translate('observability.alerting.monitorsTable.partialAccessBadge', {
                    defaultMessage: 'partial access',
                  })}
                </EuiBadge>
              )}
              {showGroupBadge && (
                <div style={{ marginLeft: 24, marginTop: -2 }}>
                  <EuiBadge color="hollow" style={{ fontSize: 10 }}>
                    {item.group}
                  </EuiBadge>
                </div>
              )}
            </div>
          );
        },
      });
    } else if (colId === 'status') {
      cols.push({
        field: 'status',
        name: i18n.translate('observability.alerting.monitorsTable.columns.status', {
          defaultMessage: 'Status',
        }),
        sortable: true,
        width: w('status'),
        render: (s: MonitorStatus, item: UnifiedRuleSummary) => {
          // Optimistic rows we injected while the querier catches up render a
          // distinct spinner badge so it's clear the rule is submitted but not
          // yet confirmed (its actions are disabled — the id would 404).
          if (isPending(item)) {
            return (
              <EuiToolTip
                content={i18n.translate(
                  'observability.alerting.monitorsTable.columns.pendingTooltip',
                  { defaultMessage: 'Waiting for the querier to confirm this rule' }
                )}
              >
                <EuiBadge color="hollow" data-test-subj="pendingRuleBadge">
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiLoadingSpinner size="s" />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      {i18n.translate('observability.alerting.monitorsTable.columns.pending', {
                        defaultMessage: 'Pending',
                      })}
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiBadge>
              </EuiToolTip>
            );
          }
          const at = cloudWatchStateAt?.(item);
          if (at && !at.state) {
            // Older than CloudWatch's alarm history: say so instead of guessing.
            return (
              <EuiToolTip content={stateAtTooltip(at)}>
                <EuiTextColor color="subdued" data-test-subj="cloudWatchStatusUnknownAtWindowEnd">
                  {i18n.translate('observability.alerting.monitorsTable.columns.noHistory', {
                    defaultMessage: 'No history',
                  })}
                </EuiTextColor>
              </EuiToolTip>
            );
          }
          const atState = at?.state;
          const cw =
            item.cloudWatch && atState ? { ...item.cloudWatch, state: atState } : item.cloudWatch;
          const status = atState ? cloudWatchStateToStatus(atState) : s;
          const unifiedLabel = getMonitorStateLabel(status);
          // Long values ("insufficient data", "CW: INSUFFICIENT_DATA") must
          // not overflow the (user-resizable) status column: both the health
          // label and the CW badge truncate with an ellipsis, and the full
          // text stays reachable via tooltip.
          const truncate: React.CSSProperties = {
            display: 'block',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          };
          return (
            <EuiFlexGroup
              gutterSize="xs"
              alignItems="center"
              responsive={false}
              wrap
              style={{ minWidth: 0 }}
            >
              <EuiFlexItem grow={false} style={{ maxWidth: '100%', minWidth: 0 }}>
                <EuiHealth
                  color={STATUS_COLORS[status] || 'subdued'}
                  data-test-subj={at ? 'cloudWatchStatusAtWindowEnd' : undefined}
                >
                  <span style={truncate} title={at ? stateAtTooltip(at) : unifiedLabel}>
                    {unifiedLabel}
                  </span>
                </EuiHealth>
              </EuiFlexItem>
              {cw && (
                <EuiFlexItem grow={false} style={{ maxWidth: '100%', minWidth: 0 }}>
                  <EuiToolTip
                    content={
                      at
                        ? stateAtTooltip(at)
                        : i18n.translate(
                            'observability.alerting.monitorsTable.columns.cloudWatchStateTooltip',
                            {
                              defaultMessage: 'CloudWatch state: {state}',
                              values: { state: getCloudWatchStateLabel(cw.state) },
                            }
                          )
                    }
                  >
                    <EuiBadge color={CLOUDWATCH_STATE_BADGE_COLOR[cw.state] || 'hollow'}>
                      <span style={truncate}>CW: {getCloudWatchStateLabel(cw.state)}</span>
                    </EuiBadge>
                  </EuiToolTip>
                </EuiFlexItem>
              )}
              {at && (
                // Visible cue that the row shows the window end, not now.
                <EuiFlexItem grow={false} style={{ flexBasis: '100%' }}>
                  <EuiTextColor color="subdued" style={{ fontSize: 11 }}>
                    {i18n.translate('observability.alerting.monitorsTable.columns.atTime', {
                      defaultMessage: 'at {time}',
                      values: { time: formatAt(at.atMs) },
                    })}
                  </EuiTextColor>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          );
        },
      });
    } else if (colId === 'severity') {
      cols.push({
        field: 'severity',
        name: i18n.translate('observability.alerting.monitorsTable.columns.severity', {
          defaultMessage: 'Severity',
        }),
        sortable: true,
        width: w('severity'),
        render: (s: UnifiedAlertSeverity) => (
          <EuiBadge color={SEVERITY_COLORS[s] || 'default'}>{getSeverityLabel(s)}</EuiBadge>
        ),
      });
    } else if (colId === 'monitorType') {
      cols.push({
        field: 'monitorType',
        name: i18n.translate('observability.alerting.monitorsTable.columns.type', {
          defaultMessage: 'Type',
        }),
        sortable: true,
        width: w('monitorType'),
        render: (t: MonitorType) => <EuiBadge color="hollow">{TYPE_LABELS[t] || t}</EuiBadge>,
      });
    } else if (colId === 'healthStatus') {
      cols.push({
        field: 'healthStatus',
        name: i18n.translate('observability.alerting.monitorsTable.columns.health', {
          defaultMessage: 'Health',
        }),
        sortable: true,
        width: w('healthStatus'),
        render: (h: MonitorHealthStatus, item: UnifiedRuleSummary) => {
          const at = cloudWatchStateAt?.(item);
          if (at && !at.state) {
            return (
              <EuiToolTip content={stateAtTooltip(at)}>
                <EuiTextColor color="subdued">—</EuiTextColor>
              </EuiToolTip>
            );
          }
          const health = at?.state ? cloudWatchStateToHealth(at.state) : h;
          const cell = (
            <EuiHealth color={HEALTH_COLORS[health] || 'subdued'}>
              {getMonitorStateLabel(health)}
            </EuiHealth>
          );
          return at ? <EuiToolTip content={stateAtTooltip(at)}>{cell}</EuiToolTip> : cell;
        },
      });
    } else if (colId === 'datasource') {
      cols.push({
        field: 'datasourceId',
        name: i18n.translate('observability.alerting.monitorsTable.columns.datasource', {
          defaultMessage: 'Datasource',
        }),
        sortable: (r: UnifiedRuleSummary) =>
          (dsNameMap.get(r.datasourceId) || r.datasourceId).toLowerCase(),
        width: w('datasource'),
        // A bare string cell wraps mid-word for long datasource names (e.g.
        // "ObservabilityStack_Prometheus"). EUI's `truncateText` doesn't
        // single-line a plain-text render in this table, so use the shared
        // `TruncatedLabel` (single-line ellipsis + instant full-text tooltip),
        // matching the datasource facet in the filter panel.
        render: (id: string, item: UnifiedRuleSummary) => {
          const label = dsNameMap.get(id) || id;
          const cw = item.cloudWatch;
          // CloudWatch rows show the account · region beneath the name so a
          // multi-account view is legible at a glance (matches the demo).
          const accountRegion =
            cw && (cw.accountId || cw.region)
              ? [cw.accountId, cw.region].filter(Boolean).join(' · ')
              : undefined;
          if (!accountRegion) return <TruncatedLabel text={label} />;
          return (
            <div>
              <TruncatedLabel text={label} />
              <EuiTextColor color="subdued" style={{ fontSize: 11 }}>
                {accountRegion}
              </EuiTextColor>
            </div>
          );
        },
      });
    }
  }
  return cols;
}
