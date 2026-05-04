/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resizable columns — DOM-attached drag handles for the monitors table.
 * Extracted from `monitors_table.tsx` so the imperative DOM wiring is
 * isolated from the main component's render path.
 *
 * Contents:
 *   - `DEFAULT_WIDTHS` — per-column pixel widths (fallback when the user has
 *     not dragged a column yet)
 *   - `useResizableColumns` — hook that appends resize handles to each
 *     rendered `<th>` and writes new widths back to state
 */
import React, { useEffect } from 'react';
import type { ColumnId } from './monitors_table_columns';

// Default widths per column
export const DEFAULT_WIDTHS: Record<string, number> = {
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
export function useResizableColumns(
  tableRef: React.RefObject<HTMLDivElement | null>,
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
