/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';
import { buildTableColumns } from '../monitors_table_columns';
import type { UnifiedRuleSummary } from '../../../../../common/types/alerting';

const baseParams = {
  filtered: [] as UnifiedRuleSummary[],
  selectedIds: new Set<string>(),
  columnWidths: {},
  dsNameMap: new Map<string, string>(),
  toggleSelect: jest.fn(),
  toggleSelectAll: jest.fn(),
  setSelectedMonitor: jest.fn(),
};

// Pull a single column's `render` out of the built column set by field name so
// the tests exercise the exact cell renderer the table uses.
const renderCell = (field: string, value: unknown) => {
  const cols = buildTableColumns({
    ...baseParams,
    visibleColumns: new Set([field]),
  });
  const col = cols.find((c) => c.field === field) as
    | { render?: (v: unknown, item?: UnifiedRuleSummary) => React.ReactNode }
    | undefined;
  if (!col?.render) throw new Error(`no render for column "${field}"`);
  return render(<div>{col.render(value)}</div>);
};

describe('monitors_table_columns cell labels', () => {
  // The alerts table reads "Active"/"Medium"/"Healthy"; before this change the
  // rules table rendered the raw lowercase backend tokens next to it, so the
  // same vocabulary read two different ways on adjacent tabs.
  it('title-cases the status cell instead of showing the raw token', () => {
    const { getByText, queryByText } = renderCell('status', 'active');
    expect(getByText('Active')).toBeInTheDocument();
    expect(queryByText('active')).toBeNull();
  });

  it('title-cases the severity cell', () => {
    const { getByText, queryByText } = renderCell('severity', 'medium');
    expect(getByText('Medium')).toBeInTheDocument();
    expect(queryByText('medium')).toBeNull();
  });

  it('renders the health cell without leaking the no_data underscore', () => {
    const { getByText, queryByText } = renderCell('healthStatus', 'no_data');
    expect(getByText('No data')).toBeInTheDocument();
    expect(queryByText('no_data')).toBeNull();
  });

  it('passes AD/forecaster lifecycle statuses through unchanged', () => {
    // These arrive already display-ready; re-casing them would corrupt the
    // wording, so the label getter must leave them alone.
    const { getByText } = renderCell('status', 'Awaiting data to init');
    expect(getByText('Awaiting data to init')).toBeInTheDocument();
  });
});
