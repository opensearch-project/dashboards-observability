/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Memoized EUI in-memory table wrapper. Factored out of the main
 * `MonitorsTable` component so its pagination state stays stable under the
 * ancestor `EuiResizableContainer`, which re-renders on every mouse move.
 * Without this wrap, the mid-click re-render cascade causes Chrome to drop
 * the `click` event between mousedown and mouseup. Mirrors the pattern in
 * public/components/apm/pages/services_home/services_home.tsx.
 */
import React from 'react';
import { EuiInMemoryTable } from '@elastic/eui';
import { UnifiedRuleSummary } from '../../../../common/types/alerting';

export interface MonitorsEuiTableProps {
  items: UnifiedRuleSummary[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- EuiInMemoryTable column type is complex
  columns: any[];
  loading: boolean;
  rowProps: (item: UnifiedRuleSummary) => React.HTMLAttributes<HTMLTableRowElement>;
}

export const MonitorsEuiTable = React.memo(
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
