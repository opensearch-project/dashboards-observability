/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enhanced Monitors Table — search, filter, sort, column customization,
 * saved searches, bulk delete, and JSON export.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiInMemoryTable,
  EuiHealth,
  EuiBadge,
  EuiFieldSearch,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiButton,
  EuiButtonEmpty,
  EuiPopover,
  EuiCheckboxGroup,
  EuiEmptyPrompt,
  EuiConfirmModal,
  EuiText,
  EuiPanel,
  EuiButtonIcon,
  EuiResizableContainer,
  EuiListGroup,
  EuiListGroupItem,
} from '@elastic/eui';
import {
  UnifiedRule,
  UnifiedAlertSeverity,
  MonitorType,
  MonitorStatus,
  MonitorHealthStatus,
  Datasource,
} from '../../../server/services/alerting';
import { serializeMonitors } from '../../../common/services/alerting/serializer';
import { MonitorDetailFlyout } from './monitor_detail_flyout';
import { FacetFilterGroup, useFacetCollapse } from './facet_filter_panel';
import { SEVERITY_COLORS, STATUS_COLORS, HEALTH_COLORS, TYPE_LABELS } from './shared_constants';

// ============================================================================
// Constants
// ============================================================================

const INTERNAL_LABEL_KEYS = new Set([
  'monitor_type',
  'monitor_kind',
  'datasource_id',
  '_workspace',
  'monitor_id',
  'trigger_id',
  'trigger_name',
]);

const BACKEND_DISPLAY: Record<string, string> = {
  opensearch: 'OpenSearch',
  prometheus: 'Prometheus',
};

// ============================================================================
// Types
// ============================================================================

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: FilterState;
}

interface FilterState {
  status: MonitorStatus[];
  severity: UnifiedAlertSeverity[];
  monitorType: MonitorType[];
  healthStatus: MonitorHealthStatus[];
  labels: Record<string, string[]>;
  createdBy: string[];
  destinations: string[];
  backend: string[];
}

const emptyFilters = (): FilterState => ({
  status: [],
  severity: [],
  monitorType: [],
  healthStatus: [],
  labels: {},
  createdBy: [],
  destinations: [],
  backend: [],
});

interface MonitorsTableProps {
  rules: UnifiedRule[];
  datasources: Datasource[];
  loading: boolean;
  apiClient: import('../services/alarms_client').AlarmsApiClient;
  onDelete: (ids: string[]) => void;
  onClone?: (monitor: UnifiedRule) => void;
  onImport?: (configs: unknown[]) => void;
  onCreateMonitor?: (type: 'logs' | 'prometheus' | 'metrics' | 'slo') => void;
  /** Currently selected datasource IDs */
  selectedDsIds: string[];
  /** Callback when datasource selection changes */
  onDatasourceChange: (ids: string[]) => void;
}

// ============================================================================
// Suggestion Engine
// ============================================================================

function buildSuggestions(rules: UnifiedRule[]): string[] {
  const set = new Set<string>();
  for (const r of rules) {
    set.add(r.name);
    for (const [k, v] of Object.entries(r.labels)) {
      set.add(`${k}:${v}`);
      set.add(v);
    }
    for (const v of Object.values(r.annotations)) {
      if (v.length < 80) set.add(v);
    }
  }
  return Array.from(set).sort();
}

function matchesSearch(rule: UnifiedRule, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  return terms.every((term) => {
    // Support label:value syntax
    if (term.includes(':')) {
      const [key, val] = term.split(':', 2);
      const labelVal = rule.labels[key];
      if (labelVal && labelVal.toLowerCase().includes(val)) return true;
      const annoVal = rule.annotations[key];
      if (annoVal && annoVal.toLowerCase().includes(val)) return true;
    }
    if (rule.name.toLowerCase().includes(term)) return true;
    for (const v of Object.values(rule.labels)) {
      if (v.toLowerCase().includes(term)) return true;
    }
    for (const v of Object.values(rule.annotations)) {
      if (v.toLowerCase().includes(term)) return true;
    }
    return false;
  });
}

function matchesFilters(rule: UnifiedRule, filters: FilterState): boolean {
  if (filters.status.length > 0 && !filters.status.includes(rule.status)) return false;
  if (filters.severity.length > 0 && !filters.severity.includes(rule.severity)) return false;
  if (filters.monitorType.length > 0 && !filters.monitorType.includes(rule.monitorType))
    return false;
  if (filters.healthStatus.length > 0 && !filters.healthStatus.includes(rule.healthStatus))
    return false;
  if (filters.createdBy.length > 0 && !filters.createdBy.includes(rule.createdBy)) return false;
  if (filters.backend.length > 0 && !filters.backend.includes(rule.datasourceType)) return false;
  if (filters.destinations.length > 0) {
    const hasMatch = rule.notificationDestinations.some((d) => filters.destinations.includes(d));
    if (!hasMatch) return false;
  }
  for (const [key, values] of Object.entries(filters.labels)) {
    if (values.length > 0) {
      const ruleVal = rule.labels[key];
      if (!ruleVal || !values.includes(ruleVal)) return false;
    }
  }
  return true;
}

// ============================================================================
// All unique label keys from rules
// ============================================================================

function collectLabelKeys(rules: UnifiedRule[]): string[] {
  const keys = new Set<string>();
  for (const r of rules) {
    for (const k of Object.keys(r.labels)) keys.add(k);
  }
  return Array.from(keys).sort();
}

function collectUniqueValues(
  rules: UnifiedRule[],
  field: (r: UnifiedRule) => string | string[]
): string[] {
  const set = new Set<string>();
  for (const r of rules) {
    const val = field(r);
    if (Array.isArray(val)) val.forEach((v) => set.add(v));
    else if (val) set.add(val);
  }
  return Array.from(set).sort();
}

function collectLabelValues(rules: UnifiedRule[], key: string): string[] {
  const set = new Set<string>();
  for (const r of rules) {
    const v = r.labels[key];
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}

// ============================================================================
// Column Definitions
// ============================================================================

type ColumnId =
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

interface ColumnDef {
  id: ColumnId;
  label: string;
  isLabelColumn?: boolean;
}

const BASE_COLUMNS: ColumnDef[] = [
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

const DEFAULT_VISIBLE: ColumnId[] = [
  'name',
  'status',
  'severity',
  'monitorType',
  'healthStatus',
  'backend',
  'datasource',
];

// ============================================================================
// Resizable Column Header — no longer used inline, see useResizableColumns hook
// ============================================================================

// Default widths per column
const DEFAULT_WIDTHS: Record<string, number> = {
  name: 220,
  status: 100,
  severity: 100,
  monitorType: 110,
  healthStatus: 90,
  labels: 260,
  backend: 110,
  datasource: 150,
  createdBy: 110,
  createdAt: 130,
  lastModified: 160,
  lastTriggered: 160,
  destinations: 160,
  query: 200,
  group: 100,
};

/**
 * Hook that attaches real DOM resize handles to EuiInMemoryTable header cells.
 * Works by observing the rendered <th> elements and appending a drag handle div.
 */
function useResizableColumns(
  tableRef: React.RefObject<HTMLDivElement>,
  columnWidths: Record<string, number>,
  setColumnWidths: React.Dispatch<React.SetStateAction<Record<string, number>>>,
  visibleColumns: Set<ColumnId>
) {
  useEffect(() => {
    const wrapper = tableRef.current;
    if (!wrapper) return;

    const ths = wrapper.querySelectorAll<HTMLTableCellElement>('thead th');
    const handles: HTMLDivElement[] = [];

    // Column order: first is checkbox (skip), then visible columns in order
    const colIds = ['_select', ...Array.from(visibleColumns)];

    ths.forEach((th, index) => {
      const colId = colIds[index];
      if (!colId || colId === '_select') return;

      // Make th position relative so handle can be absolute inside it
      th.style.position = 'relative';
      th.style.overflow = 'visible';

      // Create handle element
      const handle = document.createElement('div');
      handle.style.cssText = `
        position: absolute; right: -4px; top: 0; bottom: 0; width: 8px;
        cursor: col-resize; z-index: 10; display: flex; align-items: center; justify-content: center;
      `;
      // Visible grip
      const grip = document.createElement('div');
      grip.style.cssText = `
        width: 3px; height: 50%; border-radius: 2px;
        background-color: #D3DAE6; transition: background-color 150ms ease;
      `;
      handle.appendChild(grip);

      handle.addEventListener('mouseenter', () => {
        grip.style.backgroundColor = '#69707D';
      });
      handle.addEventListener('mouseleave', () => {
        grip.style.backgroundColor = '#D3DAE6';
      });

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = th.offsetWidth;
        grip.style.backgroundColor = '#006BB4';
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (moveEvent: MouseEvent) => {
          const delta = moveEvent.clientX - startX;
          const newWidth = Math.max(60, startWidth + delta);
          th.style.width = `${newWidth}px`;
          // Also update state so it persists across re-renders
          setColumnWidths((prev) => ({ ...prev, [colId]: newWidth }));
        };
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          grip.style.backgroundColor = '#D3DAE6';
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      th.appendChild(handle);
      handles.push(handle);
    });

    return () => {
      handles.forEach((h) => h.remove());
    };
    // Intentionally excluding `setColumnWidths` (stable setter) and `tableRef`
    // (stable ref object). Re-attaching handles on columnWidths change would
    // fight the in-effect width update and cause re-render churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns]);
}

// ============================================================================
// Memoized Table — keeps EuiInMemoryTable pagination state stable under the
// ancestor `EuiResizableContainer`, which re-renders on every mouse move.
// Without this wrap, the mid-click re-render cascade causes Chrome to drop
// the `click` event between mousedown and mouseup. Mirrors the pattern in
// public/components/apm/pages/services_home/services_home.tsx.
// ============================================================================

interface MonitorsEuiTableProps {
  items: UnifiedRule[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- EuiInMemoryTable column type is complex
  columns: any[];
  loading: boolean;
  rowProps: (item: UnifiedRule) => React.HTMLAttributes<HTMLTableRowElement>;
}

const MonitorsEuiTable = React.memo(
  ({ items, columns, loading, rowProps }: MonitorsEuiTableProps) => (
    <EuiInMemoryTable
      items={items}
      columns={columns}
      loading={loading}
      pagination={{ initialPageSize: 20, pageSizeOptions: [10, 20, 50] }}
      sorting={{ sort: { field: 'name', direction: 'asc' } }}
      rowProps={rowProps}
    />
  )
);

// ============================================================================
// Main Component
// ============================================================================

export const MonitorsTable: React.FC<MonitorsTableProps> = ({
  rules,
  datasources,
  loading,
  apiClient,
  onDelete,
  onClone,
  onImport,
  onCreateMonitor,
  selectedDsIds,
  onDatasourceChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(new Set(DEFAULT_VISIBLE));
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({ ...DEFAULT_WIDTHS });
  const [selectedMonitor, setSelectedMonitor] = useState<UnifiedRule | null>(null);
  const [showCreatePopover, setShowCreatePopover] = useState(false);
  const [showSaveSearchInput, setShowSaveSearchInput] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  const rowProps = useCallback(
    (item: UnifiedRule) => ({
      style: selectedIds.has(item.id) ? { backgroundColor: '#F0F5FF' } : undefined,
    }),
    [selectedIds]
  );

  const dsNameMap = useMemo(() => new Map(datasources.map((d) => [d.id, d.name])), [datasources]);

  // Build selectable datasource entries for the filter facet — alpha by name
  const datasourceEntries = useMemo(
    () =>
      datasources
        .map((ds) => ({ id: ds.id, label: ds.name }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
    [datasources]
  );

  const allSuggestions = useMemo(() => buildSuggestions(rules), [rules]);
  const labelKeys = useMemo(() => collectLabelKeys(rules), [rules]);

  // Build available columns including dynamic label columns
  const allColumns = useMemo(() => {
    const cols = [...BASE_COLUMNS];
    for (const key of labelKeys) {
      cols.push({ id: `label:${key}`, label: `Label: ${key}`, isLabelColumn: true });
    }
    return cols;
  }, [labelKeys]);

  // Update suggestions as user types
  useEffect(() => {
    if (!searchQuery) {
      setSuggestions([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches = allSuggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 10);
    setSuggestions(matches);
  }, [searchQuery, allSuggestions]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter (sorting is handled by EuiInMemoryTable via the column `sortable` keys)
  const filtered = useMemo(
    () => rules.filter((r) => matchesSearch(r, searchQuery) && matchesFilters(r, filters)),
    [rules, searchQuery, filters]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    count += filters.status.length;
    count += filters.severity.length;
    count += filters.monitorType.length;
    count += filters.healthStatus.length;
    count += filters.createdBy.length;
    count += filters.destinations.length;
    count += filters.backend.length;
    for (const vals of Object.values(filters.labels)) count += vals.length;
    return count;
  }, [filters]);

  // Selection
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r) => r.id)));
  };

  // Saved searches
  const saveCurrentSearch = () => {
    setShowSaveSearchInput(true);
  };
  const loadSavedSearch = (ss: SavedSearch) => {
    setSearchQuery(ss.query);
    setFilters(ss.filters);
  };
  const deleteSavedSearch = (id: string) => {
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
  };

  // Export
  const exportJson = () => {
    const configs = serializeMonitors(filtered);
    const blob = new Blob([JSON.stringify(configs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'monitors-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import
  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement)?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          const configs = Array.isArray(data) ? data : data.monitors;
          if (onImport && Array.isArray(configs)) onImport(configs);
        } catch (_err) {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Bulk delete
  const handleBulkDelete = () => {
    onDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  };

  // Build table columns from visible set
  const tableColumns = useMemo(() => {
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
        render: (_: unknown, item: UnifiedRule) => (
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
          render: (name: string, item: UnifiedRule) => (
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
          sortable: (r: UnifiedRule) =>
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
    // `toggleSelect`/`toggleSelectAll` are recreated every render; adding them
    // would invalidate this memo every render. The closures only read from
    // `selectedIds`/`filtered` which are in the dep list, so staleness is
    // bounded to the same render cycle as the columns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns, selectedIds, filtered, dsNameMap, columnWidths]);

  // Attach DOM-based resize handles to table header cells
  useResizableColumns(tableWrapperRef, columnWidths, setColumnWidths, visibleColumns);

  // Unique values for filter dropdowns
  const uniqueStatuses = useMemo(() => collectUniqueValues(rules, (r) => r.status), [rules]);
  const uniqueSeverities = useMemo(() => collectUniqueValues(rules, (r) => r.severity), [rules]);
  const uniqueTypes = useMemo(() => collectUniqueValues(rules, (r) => r.monitorType), [rules]);
  const uniqueHealth = useMemo(() => collectUniqueValues(rules, (r) => r.healthStatus), [rules]);
  const uniqueCreators = useMemo(() => collectUniqueValues(rules, (r) => r.createdBy), [rules]);
  const uniqueBackends = useMemo(() => collectUniqueValues(rules, (r) => r.datasourceType), [
    rules,
  ]);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const updateLabelFilter = (key: string, values: string[]) => {
    setFilters((prev) => ({
      ...prev,
      labels: { ...prev.labels, [key]: values },
    }));
  };

  const clearAllFilters = () => {
    setFilters(emptyFilters());
    setSearchQuery('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
      e.preventDefault();
      setSearchQuery(suggestions[activeSuggestion]);
      setShowSuggestions(false);
      setActiveSuggestion(-1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Facet helper: count items per value for a given field
  const facetCounts = useMemo(() => {
    // Count against the search-matched (but not filter-matched) rules so counts update with search
    const searchMatched = rules.filter((r) => matchesSearch(r, searchQuery));
    const counts: Record<string, Record<string, number>> = {
      status: {},
      severity: {},
      monitorType: {},
      healthStatus: {},
      backend: {},
      createdBy: {},
    };
    for (const r of searchMatched) {
      counts.status[r.status] = (counts.status[r.status] || 0) + 1;
      counts.severity[r.severity] = (counts.severity[r.severity] || 0) + 1;
      counts.monitorType[r.monitorType] = (counts.monitorType[r.monitorType] || 0) + 1;
      counts.healthStatus[r.healthStatus] = (counts.healthStatus[r.healthStatus] || 0) + 1;
      counts.backend[r.datasourceType] = (counts.backend[r.datasourceType] || 0) + 1;
      counts.createdBy[r.createdBy] = (counts.createdBy[r.createdBy] || 0) + 1;
    }
    // Label counts
    const labelCounts: Record<string, Record<string, number>> = {};
    for (const key of labelKeys) {
      labelCounts[key] = {};
      for (const r of searchMatched) {
        const v = r.labels[key];
        if (v) labelCounts[key][v] = (labelCounts[key][v] || 0) + 1;
      }
    }
    return { counts, labelCounts };
  }, [rules, searchQuery, labelKeys]);

  // Collapsible facet sections state (shared hook)
  const { toggleFacetCollapse, isCollapsed: isFacetCollapsed } = useFacetCollapse();

  // Render a single facet group (delegates to shared component)
  const renderFacetGroup = (
    id: string,
    label: string,
    options: string[],
    selected: string[],
    onChange: (v: string[]) => void,
    counts: Record<string, number>,
    displayMap?: Record<string, string>,
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
      displayMap={displayMap}
      colorMap={colorMap}
      isCollapsed={isFacetCollapsed(id)}
      onToggleCollapse={toggleFacetCollapse}
    />
  );

  return (
    <EuiResizableContainer style={{ flex: 1, minHeight: 0 }}>
      {(EuiResizablePanel, EuiResizableButton) => {
        return (
          <>
            <EuiResizablePanel
              id="filters-panel"
              initialSize={20}
              minSize="200px"
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
                    counts={Object.fromEntries(
                      datasourceEntries.map((e) => [
                        e.label,
                        selectedDsIds.includes(e.id) || selectedDsIds.length === 0 ? 1 : 0,
                      ])
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
                    'status',
                    'Status',
                    uniqueStatuses,
                    filters.status,
                    (v) => updateFilter('status', v as MonitorStatus[]),
                    facetCounts.counts.status,
                    undefined,
                    STATUS_COLORS
                  )}
                  {renderFacetGroup(
                    'severity',
                    'Severity',
                    uniqueSeverities,
                    filters.severity,
                    (v) => updateFilter('severity', v as UnifiedAlertSeverity[]),
                    facetCounts.counts.severity,
                    undefined,
                    SEVERITY_COLORS
                  )}
                  {renderFacetGroup(
                    'monitorType',
                    'Type',
                    uniqueTypes,
                    filters.monitorType,
                    (v) => updateFilter('monitorType', v as MonitorType[]),
                    facetCounts.counts.monitorType,
                    TYPE_LABELS
                  )}
                  {renderFacetGroup(
                    'healthStatus',
                    'Health',
                    uniqueHealth,
                    filters.healthStatus,
                    (v) => updateFilter('healthStatus', v as MonitorHealthStatus[]),
                    facetCounts.counts.healthStatus,
                    undefined,
                    HEALTH_COLORS
                  )}
                  {renderFacetGroup(
                    'backend',
                    'Backend',
                    uniqueBackends,
                    filters.backend,
                    (v) => updateFilter('backend', v),
                    facetCounts.counts.backend,
                    BACKEND_DISPLAY
                  )}
                  {renderFacetGroup(
                    'createdBy',
                    'Created By',
                    uniqueCreators,
                    filters.createdBy,
                    (v) => updateFilter('createdBy', v),
                    facetCounts.counts.createdBy
                  )}

                  {/* Label facets */}
                  {labelKeys.length > 0 && (
                    <>
                      <EuiSpacer size="xs" />
                      <EuiText size="xs" color="subdued" style={{ marginBottom: 6 }}>
                        <strong>Labels</strong>
                      </EuiText>
                      {labelKeys
                        .filter((k) => !INTERNAL_LABEL_KEYS.has(k))
                        .map((key) =>
                          renderFacetGroup(
                            `label:${key}`,
                            key,
                            collectLabelValues(rules, key),
                            filters.labels[key] || [],
                            (v) => updateLabelFilter(key, v),
                            facetCounts.labelCounts[key] || {}
                          )
                        )}
                    </>
                  )}

                  {/* Saved searches */}
                  <EuiSpacer size="s" />
                  <EuiText size="xs">
                    <strong>Saved Searches</strong>
                  </EuiText>
                  <EuiSpacer size="xs" />
                  {savedSearches.length === 0 ? (
                    <EuiText size="xs" color="subdued">
                      None yet
                    </EuiText>
                  ) : (
                    savedSearches.map((ss) => (
                      <EuiFlexGroup
                        key={ss.id}
                        gutterSize="xs"
                        alignItems="center"
                        responsive={false}
                        style={{ marginBottom: 2 }}
                      >
                        <EuiFlexItem>
                          <EuiText size="xs">
                            <span
                              role="button"
                              tabIndex={0}
                              style={{ cursor: 'pointer', color: '#006BB4' }}
                              onClick={() => loadSavedSearch(ss)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') loadSavedSearch(ss);
                              }}
                            >
                              {ss.name}
                            </span>
                          </EuiText>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButtonIcon
                            iconType="cross"
                            size="s"
                            aria-label={`Delete ${ss.name}`}
                            onClick={() => deleteSavedSearch(ss.id)}
                            color="text"
                          />
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    ))
                  )}
                  {showSaveSearchInput ? (
                    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                      <EuiFlexItem>
                        <EuiFieldText
                          placeholder="Search name"
                          value={saveSearchName}
                          onChange={(e) => setSaveSearchName(e.target.value)}
                          compressed
                          aria-label="Saved search name"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && saveSearchName.trim()) {
                              setSavedSearches((prev) => [
                                ...prev,
                                {
                                  id: `ss-${Date.now()}`,
                                  name: saveSearchName.trim(),
                                  query: searchQuery,
                                  filters: { ...filters },
                                },
                              ]);
                              setSaveSearchName('');
                              setShowSaveSearchInput(false);
                            }
                            if (e.key === 'Escape') {
                              setShowSaveSearchInput(false);
                              setSaveSearchName('');
                            }
                          }}
                          autoFocus
                        />
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiButtonEmpty
                          size="xs"
                          onClick={() => {
                            if (saveSearchName.trim()) {
                              setSavedSearches((prev) => [
                                ...prev,
                                {
                                  id: `ss-${Date.now()}`,
                                  name: saveSearchName.trim(),
                                  query: searchQuery,
                                  filters: { ...filters },
                                },
                              ]);
                              setSaveSearchName('');
                              setShowSaveSearchInput(false);
                            }
                          }}
                        >
                          Save
                        </EuiButtonEmpty>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiButtonIcon
                          iconType="cross"
                          size="s"
                          aria-label="Cancel"
                          onClick={() => {
                            setShowSaveSearchInput(false);
                            setSaveSearchName('');
                          }}
                          color="text"
                        />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  ) : (
                    <EuiButtonEmpty
                      size="xs"
                      iconType="plusInCircle"
                      onClick={saveCurrentSearch}
                      disabled={!searchQuery && activeFilterCount === 0}
                      flush="left"
                    >
                      Save current
                    </EuiButtonEmpty>
                  )}
                </div>
              </EuiPanel>
            </EuiResizablePanel>

            <EuiResizableButton />

            <EuiResizablePanel
              initialSize={80}
              minSize="400px"
              mode="main"
              paddingSize="none"
              style={{ paddingLeft: '4px', overflow: 'auto' }}
            >
              <EuiPanel
                paddingSize="s"
                hasBorder
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
              >
                {/* Create Monitor Button + Search bar */}
                <div style={{ flexShrink: 0 }}>
                  {onCreateMonitor && (
                    <EuiFlexGroup
                      justifyContent="flexEnd"
                      responsive={false}
                      gutterSize="s"
                      style={{ marginBottom: 8 }}
                    >
                      <EuiFlexItem grow={false}>
                        <EuiPopover
                          button={
                            <EuiButton
                              fill
                              iconType="plusInCircle"
                              size="s"
                              onClick={() => setShowCreatePopover((prev) => !prev)}
                            >
                              Create Monitor
                            </EuiButton>
                          }
                          isOpen={showCreatePopover}
                          closePopover={() => setShowCreatePopover(false)}
                          panelPaddingSize="none"
                          anchorPosition="downRight"
                        >
                          <EuiListGroup flush style={{ width: 200 }}>
                            <EuiListGroupItem
                              label="Logs"
                              onClick={() => {
                                setShowCreatePopover(false);
                                onCreateMonitor('logs');
                              }}
                              aria-label="Create Logs monitor"
                            />
                            <EuiListGroupItem
                              label="Metrics"
                              onClick={() => {
                                setShowCreatePopover(false);
                                onCreateMonitor('metrics');
                              }}
                              aria-label="Create Metrics monitor"
                            />
                          </EuiListGroup>
                        </EuiPopover>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  )}

                  {/* Search bar with suggestions */}
                  <div ref={searchRef} style={{ position: 'relative' }}>
                    <EuiFieldSearch
                      placeholder="Search monitors by name, labels (team:infra), annotations..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setShowSuggestions(true);
                        setActiveSuggestion(-1);
                      }}
                      onFocus={() => searchQuery && setShowSuggestions(true)}
                      onKeyDown={handleSearchKeyDown}
                      isClearable
                      fullWidth
                      aria-label="Search monitors"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <EuiPanel
                        paddingSize="none"
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 1000,
                          maxHeight: 250,
                          overflow: 'auto',
                          border: '1px solid #D3DAE6',
                          borderTop: 'none',
                        }}
                      >
                        {suggestions.map((s, i) => (
                          <div
                            key={s}
                            style={{
                              padding: '6px 12px',
                              cursor: 'pointer',
                              background: i === activeSuggestion ? '#E6F0FF' : 'white',
                            }}
                            onMouseDown={() => {
                              setSearchQuery(s);
                              setShowSuggestions(false);
                            }}
                            onMouseEnter={() => setActiveSuggestion(i)}
                          >
                            <EuiText size="s">{s}</EuiText>
                          </div>
                        ))}
                      </EuiPanel>
                    )}
                  </div>
                </div>

                <EuiSpacer size="s" />

                {/* Action bar */}
                <div style={{ flexShrink: 0 }}>
                  <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="spaceBetween">
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup gutterSize="s" alignItems="center">
                        <EuiFlexItem grow={false}>
                          <EuiText size="s">
                            <strong>{filtered.length}</strong> monitors
                            {selectedIds.size > 0 && (
                              <span>
                                {' '}
                                · <strong>{selectedIds.size}</strong> selected
                              </span>
                            )}
                            {activeFilterCount > 0 && (
                              <span>
                                {' '}
                                · {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup gutterSize="s">
                        {selectedIds.size > 0 && (
                          <EuiFlexItem grow={false}>
                            <EuiButton
                              color="danger"
                              size="s"
                              iconType="trash"
                              onClick={() => setShowDeleteConfirm(true)}
                            >
                              Delete ({selectedIds.size})
                            </EuiButton>
                          </EuiFlexItem>
                        )}
                        <EuiFlexItem grow={false}>
                          <EuiButton
                            size="s"
                            iconType="exportAction"
                            onClick={exportJson}
                            isDisabled={filtered.length === 0}
                          >
                            Export
                          </EuiButton>
                        </EuiFlexItem>
                        {onImport && (
                          <EuiFlexItem grow={false}>
                            <EuiButton size="s" iconType="importAction" onClick={handleImportFile}>
                              Import
                            </EuiButton>
                          </EuiFlexItem>
                        )}
                        <EuiFlexItem grow={false}>
                          <EuiPopover
                            button={
                              <EuiButton
                                size="s"
                                iconType="listAdd"
                                onClick={() => setShowColumnPicker(!showColumnPicker)}
                              >
                                Columns
                              </EuiButton>
                            }
                            isOpen={showColumnPicker}
                            closePopover={() => setShowColumnPicker(false)}
                            panelPaddingSize="s"
                          >
                            <div style={{ width: 250, maxHeight: 400, overflow: 'auto' }}>
                              <EuiText size="xs">
                                <strong>Toggle columns</strong>
                              </EuiText>
                              <EuiSpacer size="xs" />
                              <EuiCheckboxGroup
                                options={allColumns.map((c) => ({ id: c.id, label: c.label }))}
                                idToSelectedMap={Object.fromEntries(
                                  allColumns.map((c) => [c.id, visibleColumns.has(c.id)])
                                )}
                                onChange={(id) => {
                                  const next = new Set(visibleColumns);
                                  if (next.has(id)) next.delete(id);
                                  else next.add(id);
                                  setVisibleColumns(next);
                                }}
                              />
                            </div>
                          </EuiPopover>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </div>

                <EuiSpacer size="s" />

                {/* Table */}
                <div
                  style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}
                  className="monitors-table-wrapper"
                  ref={tableWrapperRef}
                >
                  <style>{`
              .monitors-table-wrapper .euiTable { table-layout: auto; min-width: 100%; }
              .monitors-table-wrapper .euiTableHeaderCell { position: relative; }
              .monitors-table-wrapper .euiTableHeaderCell:last-child { border-right: none; }
            `}</style>
                  {!loading && filtered.length === 0 ? (
                    <EuiEmptyPrompt
                      title={<h2>No Monitors Found</h2>}
                      body={
                        <p>
                          {rules.length === 0
                            ? 'No monitors configured yet.'
                            : 'No monitors match your current search and filters.'}
                        </p>
                      }
                      actions={
                        activeFilterCount > 0 || searchQuery ? (
                          <EuiButton onClick={clearAllFilters}>Clear filters</EuiButton>
                        ) : undefined
                      }
                    />
                  ) : (
                    <MonitorsEuiTable
                      items={filtered}
                      columns={tableColumns}
                      loading={loading}
                      rowProps={rowProps}
                    />
                  )}
                </div>
              </EuiPanel>

              {/* Delete confirmation modal */}
              {showDeleteConfirm && (
                <EuiConfirmModal
                  title={`Delete ${selectedIds.size} monitor${selectedIds.size > 1 ? 's' : ''}?`}
                  onCancel={() => setShowDeleteConfirm(false)}
                  onConfirm={handleBulkDelete}
                  cancelButtonText="Cancel"
                  confirmButtonText="Delete"
                  buttonColor="danger"
                >
                  <p>
                    This will remove the selected monitor{selectedIds.size > 1 ? 's' : ''} from the
                    current view. This action cannot be undone within this session.
                  </p>
                </EuiConfirmModal>
              )}

              {/* Monitor detail flyout */}
              {selectedMonitor && (
                <MonitorDetailFlyout
                  monitor={selectedMonitor}
                  apiClient={apiClient}
                  onClose={() => setSelectedMonitor(null)}
                  onDelete={(id) => {
                    onDelete([id]);
                    setSelectedMonitor(null);
                  }}
                  onClone={(monitor) => {
                    if (onClone) onClone(monitor);
                    setSelectedMonitor(null);
                  }}
                />
              )}
            </EuiResizablePanel>
          </>
        );
      }}
    </EuiResizableContainer>
  );
};
