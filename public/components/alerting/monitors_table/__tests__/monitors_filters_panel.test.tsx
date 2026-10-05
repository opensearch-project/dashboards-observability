/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { MonitorsFiltersPanel } from '../monitors_filters_panel';
import { emptyFilters } from '../monitors_table_filters';

// Minimal-but-complete props so the pure-render panel mounts. Only the Status /
// Severity / Health facet wiring is under test here; everything else is inert.
const makeProps = (overrides = {}) => ({
  rules: [],
  datasources: [],
  selectedDsIds: [],
  onDatasourceChange: jest.fn(),
  maxDatasources: 5,
  onDatasourceCapReached: jest.fn(),
  datasourceErrorMap: {},
  filters: emptyFilters(),
  activeFilterCount: 0,
  clearAllFilters: jest.fn(),
  updateFilter: jest.fn(),
  updateLabelFilter: jest.fn(),
  labelKeys: [],
  datasourceEntries: [],
  uniqueStatuses: ['active', 'muted'],
  uniqueSeverities: ['critical', 'medium'],
  uniqueTypes: [],
  uniqueHealth: ['healthy', 'no_data'],
  uniqueCreators: [],
  facetCounts: {
    counts: {
      status: { active: 3, muted: 2 },
      severity: { critical: 1, medium: 4 },
      monitorType: {},
      healthStatus: { healthy: 4, no_data: 1 },
      createdBy: {},
    },
    labelCounts: {},
  },
  isFacetCollapsed: () => false,
  toggleFacetCollapse: jest.fn(),
  onToggleOpen: jest.fn(),
  savedSearches: [],
  setSavedSearches: jest.fn(),
  loadSavedSearch: jest.fn(),
  deleteSavedSearch: jest.fn(),
  showSaveSearchInput: false,
  setShowSaveSearchInput: jest.fn(),
  saveSearchName: '',
  setSaveSearchName: jest.fn(),
  saveCurrentSearch: jest.fn(),
  searchQuery: '',
  ...overrides,
});

describe('MonitorsFiltersPanel — facet labels match the table', () => {
  // Regression guard: the Status/Severity/Health facet labels must read the
  // same humanized text as the table cells (PR labelled those cells). If the
  // facet still showed the raw token while the table showed Title Case, the two
  // halves of the same screen would disagree — the defect this fixes.
  it('renders humanized Status / Severity / Health facet labels, not raw tokens', () => {
    const { getByText, queryByText } = render(<MonitorsFiltersPanel {...makeProps()} />);
    expect(getByText('Active')).toBeInTheDocument();
    expect(getByText('Muted')).toBeInTheDocument();
    expect(getByText('Critical')).toBeInTheDocument();
    expect(getByText('Medium')).toBeInTheDocument();
    expect(getByText('Healthy')).toBeInTheDocument();
    // The underscore token must not leak; it reads "No data".
    expect(getByText('No data')).toBeInTheDocument();
    expect(queryByText('no_data')).toBeNull();
    // No raw lowercase enum survives as a visible facet label.
    expect(queryByText('active')).toBeNull();
    expect(queryByText('medium')).toBeNull();
  });

  it('still filters on the RAW value when a humanized facet is clicked (display-only map)', () => {
    // The crucial invariant: relabelling must not change which rows match.
    // Clicking the "Active" label must call updateFilter('status', ['active']).
    const updateFilter = jest.fn();
    const { getByText } = render(<MonitorsFiltersPanel {...makeProps({ updateFilter })} />);
    fireEvent.click(getByText('Active'));
    expect(updateFilter).toHaveBeenCalledWith('status', ['active']);

    fireEvent.click(getByText('No data'));
    expect(updateFilter).toHaveBeenCalledWith('healthStatus', ['no_data']);
  });
});
