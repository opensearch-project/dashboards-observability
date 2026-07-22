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
 *   - `ColumnId` — string union of known columns plus dynamic `label:<key>`
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
  EuiTextColor,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  MonitorHealthStatus,
  MonitorStatus,
  MonitorType,
  UnifiedAlertSeverity,
  UnifiedRuleSummary,
} from '../../../../common/types/alerting';
import { HEALTH_COLORS, SEVERITY_COLORS, STATUS_COLORS, TYPE_LABELS } from '../shared_constants';
import { DEFAULT_WIDTHS } from './resizable_columns';

// ============================================================================
// Column Definitions
// ============================================================================

export type ColumnId =
  | 'name'
  | 'status'
  | 'severity'
  | 'monitorType'
  | 'healthStatus'
  | 'datasource'
  | 'query'
  | 'group'
  | 'createdBy'
  | 'createdAt'
  | 'lastModified'
  | 'lastTriggered'
  | 'destinations'
  | string; // string for label columns

export const DEFAULT_VISIBLE: ColumnId[] = [
  'name',
  'status',
  'severity',
  'monitorType',
  'healthStatus',
  'datasource',
];

export const isDetectorDefinition = (item: UnifiedRuleSummary): boolean =>
  item.definitionType === 'detector' || item.monitorType === 'detector';

export const isForecasterDefinition = (item: UnifiedRuleSummary): boolean =>
  item.definitionType === 'forecaster' || item.monitorType === 'forecaster';

export const isReadOnlyRuleDefinition = (item: UnifiedRuleSummary): boolean =>
  isDetectorDefinition(item) || isForecasterDefinition(item);

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
  const selectable = filtered.filter((item) => !isReadOnlyRuleDefinition(item));
  const allSelectableSelected =
    selectable.length > 0 && selectable.every((item) => selectedIds.has(item.id));

  const cols: Array<Record<string, any>> = [
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
        const isReadOnly = isReadOnlyRuleDefinition(item);
        return (
          <input
            type="checkbox"
            checked={!isReadOnly && selectedIds.has(item.id)}
            disabled={isReadOnly}
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
              {item.datasourceType === 'prometheus' && item.group && (
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
        render: (s: MonitorStatus) => (
          <EuiHealth color={STATUS_COLORS[s] || 'subdued'}>{s}</EuiHealth>
        ),
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
          <EuiBadge color={SEVERITY_COLORS[s] || 'default'}>{s}</EuiBadge>
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
          <EuiHealth color={HEALTH_COLORS[h] || 'subdued'}>{h}</EuiHealth>
        ),
      });
    } else if (colId === 'labels') {
      cols.push({
        field: 'labels',
        name: i18n.translate('observability.alerting.monitorsTable.columns.labels', {
          defaultMessage: 'Labels',
        }),
        width: w('labels'),
        render: (labels: Record<string, string>) => {
          const entries = Object.entries(labels);
          if (entries.length === 0) return <EuiTextColor color="subdued">—</EuiTextColor>;
          return (
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {entries.map(([k, v]) => (
                <EuiFlexItem grow={false} key={k}>
                  <EuiBadge color="hollow" title={`${k}: ${v}`}>
                    {k}:{v}
                  </EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          );
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
        render: (id: string) => dsNameMap.get(id) || id,
      });
    } else if (colId === 'createdBy') {
      cols.push({
        field: 'createdBy',
        name: i18n.translate('observability.alerting.monitorsTable.columns.createdBy', {
          defaultMessage: 'Created By',
        }),
        sortable: true,
        width: w('createdBy'),
      });
    } else if (colId === 'createdAt') {
      cols.push({
        field: 'createdAt',
        name: i18n.translate('observability.alerting.monitorsTable.columns.created', {
          defaultMessage: 'Created',
        }),
        sortable: true,
        width: w('createdAt'),
        render: (ts: string) => (ts ? new Date(ts).toLocaleDateString() : '-'),
      });
    } else if (colId === 'lastModified') {
      cols.push({
        field: 'lastModified',
        name: i18n.translate('observability.alerting.monitorsTable.columns.lastModified', {
          defaultMessage: 'Last Modified',
        }),
        sortable: true,
        width: w('lastModified'),
        render: (ts: string) => (ts ? new Date(ts).toLocaleString() : '-'),
      });
    } else if (colId === 'lastTriggered') {
      cols.push({
        field: 'lastTriggered',
        name: i18n.translate('observability.alerting.monitorsTable.columns.lastTriggered', {
          defaultMessage: 'Last Triggered',
        }),
        sortable: true,
        width: w('lastTriggered'),
        render: (ts: string) =>
          ts
            ? new Date(ts).toLocaleString()
            : i18n.translate('observability.alerting.monitorsTable.columns.lastTriggered.never', {
                defaultMessage: 'Never',
              }),
      });
    } else if (colId === 'destinations') {
      cols.push({
        field: 'notificationDestinations',
        name: i18n.translate('observability.alerting.monitorsTable.columns.destinations', {
          defaultMessage: 'Notification channels',
        }),
        width: w('destinations'),
        render: (dests: string[]) =>
          dests.length > 0 ? (
            dests.map((d, i) => (
              <EuiBadge key={i} color="hollow">
                {d}
              </EuiBadge>
            ))
          ) : (
            <EuiTextColor color="subdued">
              {i18n.translate('observability.alerting.monitorsTable.columns.destinations.none', {
                defaultMessage: 'None',
              })}
            </EuiTextColor>
          ),
      });
    } else if (colId === 'query') {
      cols.push({
        field: 'query',
        name: i18n.translate('observability.alerting.monitorsTable.columns.query', {
          defaultMessage: 'Query',
        }),
        truncateText: true,
        width: w('query'),
      });
    } else if (colId === 'group') {
      cols.push({
        field: 'group',
        name: i18n.translate('observability.alerting.monitorsTable.columns.group', {
          defaultMessage: 'Rule Group',
        }),
        width: w('group'),
        render: (g: string) => g || '-',
      });
    } else if (colId.startsWith('label:')) {
      const key = colId.replace('label:', '');
      cols.push({
        field: 'labels',
        name: key,
        sortable: false,
        width: w(colId),
        render: (labels: Record<string, string>) => {
          const val = labels[key];
          return val ? (
            <EuiBadge color="hollow">{val}</EuiBadge>
          ) : (
            <EuiTextColor color="subdued">—</EuiTextColor>
          );
        },
      });
    }
  }
  return cols;
}
