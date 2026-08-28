/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';

// Stub the heavy children — this suite only exercises the create-popover
// tooltip copy, not the table or detail flyouts.
jest.mock('../monitors_eui_table', () => ({
  MonitorsEuiTable: () => <div data-test-subj="monitorsEuiTable" />,
}));
jest.mock('../../monitor_detail_flyout', () => ({
  MonitorDetailFlyout: () => <div data-test-subj="monitorFlyout" />,
}));
jest.mock('../../detector_detail_flyout', () => ({
  DetectorDetailFlyout: () => <div data-test-subj="detectorFlyout" />,
}));
jest.mock('../../forecaster_detail_flyout', () => ({
  ForecasterDetailFlyout: () => <div data-test-subj="forecasterFlyout" />,
}));

import { MonitorsMainPanel } from '../monitors_main_panel';

const baseProps = () => ({
  rules: [],
  filtered: [],
  loading: true,
  tableColumns: [],
  rowProps: () => ({}),
  tableWrapperRef: React.createRef<HTMLDivElement>(),
  searchQuery: '',
  setSearchQuery: jest.fn(),
  showSuggestions: false,
  setShowSuggestions: jest.fn(),
  suggestions: [],
  activeSuggestion: -1,
  setActiveSuggestion: jest.fn(),
  handleSearchKeyDown: jest.fn(),
  searchRef: React.createRef<HTMLDivElement>(),
  activeFilterCount: 0,
  clearAllFilters: jest.fn(),
  selectedIds: new Set<string>(),
  setSelectedIds: jest.fn(),
  showCreatePopover: true,
  setShowCreatePopover: jest.fn(),
  showDeleteConfirm: false,
  setShowDeleteConfirm: jest.fn(),
  handleBulkDelete: jest.fn(),
  selectedMonitor: null,
  setSelectedMonitor: jest.fn(),
  onDelete: jest.fn(),
  onCreateMonitor: jest.fn(),
});

describe('MonitorsMainPanel create-button tooltips (NEW)', () => {
  // The gating model now follows datasource EXISTENCE, not facet selection, so
  // "Select one to enable" is actively misleading — selecting a datasource does
  // nothing. The copy must point at connecting/configuring a datasource.
  it('tells the user to CONNECT (not select) an OpenSearch datasource for logs rules', async () => {
    const { getByText, findByText, queryByText } = render(
      <MonitorsMainPanel {...baseProps()} logsCreateDisabled />
    );
    fireEvent.mouseOver(getByText('Logs alert rule'));
    expect(
      await findByText('Logs rules require an OpenSearch datasource. Connect one to enable.')
    ).toBeInTheDocument();
    // The stale, misleading instruction must be gone.
    expect(queryByText(/Select one to enable/)).toBeNull();
  });

  it('tells the user to CONNECT (not select) a Prometheus datasource for metrics rules', async () => {
    const { getByText, findByText, queryByText } = render(
      <MonitorsMainPanel {...baseProps()} metricsCreateDisabled />
    );
    fireEvent.mouseOver(getByText('Metrics alert rule'));
    expect(
      await findByText('Metrics rules require a Prometheus datasource. Connect one to enable.')
    ).toBeInTheDocument();
    expect(queryByText(/Select one to enable/)).toBeNull();
  });
});
