/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react';
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

describe('MonitorsFiltersPanel — Datasource facet', () => {
  const regions = [
    { id: 'us-east-1', name: 'US East (N. Virginia)' },
    { id: 'us-west-2', name: 'US West (Oregon)' },
  ];
  const datasources = [
    { id: 'os-1', name: 'Local Cluster', type: 'opensearch', url: '', enabled: true },
    { id: 'prom-1', name: 'prod-amp-workspace', type: 'prometheus', url: '', enabled: true },
    {
      id: 'cloudwatch_us-east-1_prod',
      name: 'CloudWatch · Prod account · us-east-1',
      type: 'cloudwatch',
      url: 'cloudwatch',
      enabled: true,
      region: 'us-east-1',
      cloudWatchScope: 'prod',
      cloudWatchScopeLabel: 'Prod account',
    },
  ];
  const cloudWatch = {
    regions,
    selectedRegions: ['us-east-1'],
    onRegionsChange: jest.fn(),
    onPairCapReached: jest.fn(),
  };

  it('groups the entries by type and shows one Regions control once an account is checked', () => {
    const { rerender } = render(
      <MonitorsFiltersPanel {...makeProps({ datasources, selectedDsIds: ['os-1'], cloudWatch })} />
    );
    for (const type of ['opensearch', 'prometheus', 'cloudwatch']) {
      expect(screen.getByTestId(`datasourceFacet-groupIcon-${type}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('cloudWatchRegionControl')).toBeNull();
    rerender(
      <MonitorsFiltersPanel
        {...makeProps({
          datasources,
          selectedDsIds: ['os-1', 'cloudwatch_us-east-1_prod'],
          cloudWatch,
        })}
      />
    );
    expect(screen.getAllByTestId('cloudWatchRegionControl')).toHaveLength(1);
    expect(screen.getByText('Regions')).toBeInTheDocument();
  });

  it('leaves CloudWatch account and region out of the Labels facet', () => {
    const rule = (over: Record<string, unknown>) => ({
      id: 'r',
      name: 'r',
      labels: {},
      annotations: {},
      ...over,
    });
    render(
      <MonitorsFiltersPanel
        {...makeProps({
          rules: [
            rule({
              datasourceType: 'cloudwatch',
              labels: { account: '444455556666', region: 'us-east-1', namespace: 'AWS/EC2' },
            }),
            rule({ datasourceType: 'prometheus', labels: { region: 'eu' } }),
          ],
          labelKeys: ['namespace', 'region'],
          facetCounts: {
            counts: { status: {}, severity: {}, monitorType: {}, healthStatus: {}, createdBy: {} },
            labelCounts: { namespace: { 'AWS/EC2': 1 }, region: { eu: 1 } },
          },
        })}
      />
    );
    const region = within(screen.getByTestId('facetGroup-label:region'));
    expect(region.getByText('eu')).toBeInTheDocument();
    expect(region.queryByText('us-east-1')).toBeNull();
  });
});
