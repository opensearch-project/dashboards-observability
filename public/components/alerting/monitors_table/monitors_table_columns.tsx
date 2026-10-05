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
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  MonitorHealthStatus,
  MonitorStatus,
  MonitorType,
  UnifiedAlertSeverity,
  UnifiedRuleSummary,
} from '../../../../common/types/alerting';
import {
  HEALTH_COLORS,
  isDetectorRule,
  isForecasterRule,
  SEVERITY_COLORS,
  STATUS_COLORS,
  TYPE_LABELS,
} from '../shared_constants';
import { TruncatedLabel } from '../../common/truncated_label';
import { getMonitorStateLabel, getSeverityLabel } from '../enum_labels';
import { DEFAULT_WIDTHS } from './resizable_columns';
import { isPending } from './pending_rules';

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
        sortable: true,
        truncateText: true,
        width: w('name'),
        render: (name: string, item: UnifiedRuleSummary) => {
          const iconType =
            item.datasourceType === 'prometheus' ? 'logoPrometheus' : 'logoOpenSearch';
          const showGroupBadge = item.datasourceType === 'prometheus' && !!item.group;
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
          return (
            <EuiHealth color={STATUS_COLORS[s] || 'subdued'}>{getMonitorStateLabel(s)}</EuiHealth>
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
        render: (h: MonitorHealthStatus) => (
          <EuiHealth color={HEALTH_COLORS[h] || 'subdued'}>{getMonitorStateLabel(h)}</EuiHealth>
        ),
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
        render: (id: string) => <TruncatedLabel text={dsNameMap.get(id) || id} />,
      });
    }
  }
  return cols;
}
