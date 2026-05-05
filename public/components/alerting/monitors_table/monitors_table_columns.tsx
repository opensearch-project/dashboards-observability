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
 *   - `ColumnDef` — `{ id, label, isLabelColumn? }` shape for the column picker
 *   - `BASE_COLUMNS` — ordered list of non-label columns for the picker
 *   - `DEFAULT_VISIBLE` — columns shown on first render
 *   - `buildTableColumns` — factory that returns the EuiInMemoryTable column
 *     array, taking the bits of component state the cell renderers need as
 *     explicit arguments (no closure over `this`)
 */
import React from 'react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiHealth } from '@elastic/eui';
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
  | 'backend'
  | 'datasource'
  | 'query'
  | 'group'
  | 'createdBy'
  | 'createdAt'
  | 'lastModified'
  | 'lastTriggered'
  | 'destinations'
  | string; // string for label columns

export interface ColumnDef {
  id: ColumnId;
  label: string;
  isLabelColumn?: boolean;
}

export const BASE_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name' },
  { id: 'status', label: 'Status' },
  { id: 'severity', label: 'Severity' },
  { id: 'monitorType', label: 'Type' },
  { id: 'healthStatus', label: 'Health' },
  { id: 'labels', label: 'Labels' },
  { id: 'backend', label: 'Backend' },
  { id: 'datasource', label: 'Datasource' },
  { id: 'createdBy', label: 'Created By' },
  { id: 'createdAt', label: 'Created' },
  { id: 'lastModified', label: 'Last Modified' },
  { id: 'lastTriggered', label: 'Last Triggered' },
  { id: 'destinations', label: 'Destinations' },
  { id: 'query', label: 'Query' },
  { id: 'group', label: 'Group' },
];

export const DEFAULT_VISIBLE: ColumnId[] = [
  'name',
  'status',
  'severity',
  'monitorType',
  'healthStatus',
  'backend',
  'datasource',
];

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- EuiInMemoryTable column type is complex
  const cols: Array<Record<string, any>> = [
    {
      field: '_select',
      name: (
        <input
          type="checkbox"
          checked={filtered.length > 0 && selectedIds.size === filtered.length}
          onChange={toggleSelectAll}
          aria-label="Select all monitors"
        />
      ),
      width: '32px',
      render: (_: unknown, item: UnifiedRuleSummary) => (
        <input
          type="checkbox"
          checked={selectedIds.has(item.id)}
          onChange={() => toggleSelect(item.id)}
          aria-label={`Select ${item.name}`}
        />
      ),
    },
  ];

  for (const colId of Array.from(visibleColumns)) {
    if (colId === 'name') {
      cols.push({
        field: 'name',
        name: 'Name',
        sortable: true,
        truncateText: true,
        width: w('name'),
        render: (name: string, item: UnifiedRuleSummary) => (
          <span
            role="button"
            tabIndex={0}
            style={{ fontWeight: 500, color: '#006BB4', cursor: 'pointer' }}
            onClick={() => setSelectedMonitor(item)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter') setSelectedMonitor(item);
            }}
            aria-label={`View details for ${name}`}
          >
            {name}
          </span>
        ),
      });
    } else if (colId === 'status') {
      cols.push({
        field: 'status',
        name: 'Status',
        sortable: true,
        width: w('status'),
        render: (s: MonitorStatus) => (
          <EuiHealth color={STATUS_COLORS[s] || 'subdued'}>{s}</EuiHealth>
        ),
      });
    } else if (colId === 'severity') {
      cols.push({
        field: 'severity',
        name: 'Severity',
        sortable: true,
        width: w('severity'),
        render: (s: UnifiedAlertSeverity) => (
          <EuiBadge color={SEVERITY_COLORS[s] || 'default'}>{s}</EuiBadge>
        ),
      });
    } else if (colId === 'monitorType') {
      cols.push({
        field: 'monitorType',
        name: 'Type',
        sortable: true,
        width: w('monitorType'),
        render: (t: MonitorType) => <EuiBadge color="hollow">{TYPE_LABELS[t] || t}</EuiBadge>,
      });
    } else if (colId === 'healthStatus') {
      cols.push({
        field: 'healthStatus',
        name: 'Health',
        sortable: true,
        width: w('healthStatus'),
        render: (h: MonitorHealthStatus) => (
          <EuiHealth color={HEALTH_COLORS[h] || 'subdued'}>{h}</EuiHealth>
        ),
      });
    } else if (colId === 'labels') {
      cols.push({
        field: 'labels',
        name: 'Labels',
        width: w('labels'),
        render: (labels: Record<string, string>) => {
          const entries = Object.entries(labels);
          if (entries.length === 0) return <span style={{ color: '#999' }}>—</span>;
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
    } else if (colId === 'backend') {
      cols.push({
        field: 'datasourceType',
        name: 'Backend',
        sortable: true,
        width: w('backend'),
        render: (t: string) => (
          <EuiBadge color={t === 'opensearch' ? 'primary' : 'accent'}>{t}</EuiBadge>
        ),
      });
    } else if (colId === 'datasource') {
      cols.push({
        field: 'datasourceId',
        name: 'Datasource',
        sortable: (r: UnifiedRuleSummary) =>
          (dsNameMap.get(r.datasourceId) || r.datasourceId).toLowerCase(),
        width: w('datasource'),
        render: (id: string) => dsNameMap.get(id) || id,
      });
    } else if (colId === 'createdBy') {
      cols.push({
        field: 'createdBy',
        name: 'Created By',
        sortable: true,
        width: w('createdBy'),
      });
    } else if (colId === 'createdAt') {
      cols.push({
        field: 'createdAt',
        name: 'Created',
        sortable: true,
        width: w('createdAt'),
        render: (ts: string) => (ts ? new Date(ts).toLocaleDateString() : '-'),
      });
    } else if (colId === 'lastModified') {
      cols.push({
        field: 'lastModified',
        name: 'Last Modified',
        sortable: true,
        width: w('lastModified'),
        render: (ts: string) => (ts ? new Date(ts).toLocaleString() : '-'),
      });
    } else if (colId === 'lastTriggered') {
      cols.push({
        field: 'lastTriggered',
        name: 'Last Triggered',
        sortable: true,
        width: w('lastTriggered'),
        render: (ts: string) => (ts ? new Date(ts).toLocaleString() : 'Never'),
      });
    } else if (colId === 'destinations') {
      cols.push({
        field: 'notificationDestinations',
        name: 'Destinations',
        width: w('destinations'),
        render: (dests: string[]) =>
          dests.length > 0 ? (
            dests.map((d, i) => (
              <EuiBadge key={i} color="hollow">
                {d}
              </EuiBadge>
            ))
          ) : (
            <span style={{ color: '#999' }}>None</span>
          ),
      });
    } else if (colId === 'query') {
      cols.push({ field: 'query', name: 'Query', truncateText: true, width: w('query') });
    } else if (colId === 'group') {
      cols.push({
        field: 'group',
        name: 'Group',
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
            <span style={{ color: '#999' }}>—</span>
          );
        },
      });
    }
  }
  return cols;
}
