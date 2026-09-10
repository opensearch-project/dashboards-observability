/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Stub the rendered threshold filter widgets; keep the real logic exports.
jest.mock('../../filters', () => {
  const actual = jest.requireActual('../../filters');
  return {
    ...actual,
    FailureRateThresholdFilter: () => <div data-test-subj="stub-FailureRateThresholdFilter" />,
  };
});

import { ServiceMapSidebar } from '../service_map_sidebar';
import { applicationMapI18nTexts } from '../../../../pages/application_map/application_map_i18n';
import { ApplicationMapFilters } from '../../../../common/types/service_map_types';

// Seven distinct platforms (prefix before ':'); display name is the prefix.
const SEVEN_ENVS = [
  'prod:default',
  'dev:default',
  'staging:default',
  'eks:cluster/ns',
  'ec2:asg',
  'ecs:cluster',
  'lambda:default',
];

const baseFilters: ApplicationMapFilters = {
  faultRateThresholds: [],
  errorRateThresholds: [],
  environments: [],
  searchQuery: '',
  groupBy: null,
};

const renderSidebar = (availableEnvironments: string[], environments: string[] = []) => {
  const onFiltersChange = jest.fn();
  render(
    <ServiceMapSidebar
      filters={{ ...baseFilters, environments }}
      onFiltersChange={onFiltersChange}
      availableGroupByAttributes={{}}
      availableEnvironments={availableEnvironments}
      isLoading={false}
      onToggle={jest.fn()}
    />
  );
  return { onFiltersChange };
};

const envGroup = () => screen.getByTestId('environmentCheckboxGroup');

describe('ServiceMapSidebar — Environment filter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('caps the list at 5 and toggles the full list with +N more / Show less', () => {
    renderSidebar(SEVEN_ENVS);

    // Default: first 5 in prop order (prod, dev, staging, eks, ec2).
    expect(within(envGroup()).getByText('prod')).toBeInTheDocument();
    expect(within(envGroup()).getByText('ec2')).toBeInTheDocument();
    expect(within(envGroup()).queryByText('ecs')).not.toBeInTheDocument();
    expect(within(envGroup()).queryByText('lambda')).not.toBeInTheDocument();

    // Expand.
    fireEvent.click(screen.getByTestId('environmentShowMore'));
    expect(within(envGroup()).getByText('ecs')).toBeInTheDocument();
    expect(within(envGroup()).getByText('lambda')).toBeInTheDocument();

    // Collapse.
    fireEvent.click(screen.getByTestId('environmentShowMore'));
    expect(within(envGroup()).queryByText('lambda')).not.toBeInTheDocument();
  });

  it('search narrows the list case-insensitively (matches display name)', () => {
    renderSidebar(SEVEN_ENVS);

    fireEvent.change(screen.getByTestId('environmentSearch'), { target: { value: 'EC' } });

    expect(within(envGroup()).getByText('ec2')).toBeInTheDocument();
    expect(within(envGroup()).getByText('ecs')).toBeInTheDocument();
    expect(within(envGroup()).queryByText('dev')).not.toBeInTheDocument();
  });

  it('shows noMatchingValues when a search matches nothing', () => {
    renderSidebar(SEVEN_ENVS);

    fireEvent.change(screen.getByTestId('environmentSearch'), { target: { value: 'zzzzz' } });

    expect(screen.getByText(applicationMapI18nTexts.filters.noMatchingValues)).toBeInTheDocument();
    expect(screen.queryByTestId('environmentCheckboxGroup')).not.toBeInTheDocument();
  });

  it('shows noEnvironments when there are no available environments', () => {
    renderSidebar([]);

    expect(screen.getByText(applicationMapI18nTexts.filters.noEnvironments)).toBeInTheDocument();
    expect(screen.queryByTestId('environmentSearch')).not.toBeInTheDocument();
  });

  it('Select all merges the currently-filtered subset into the selection', () => {
    const { onFiltersChange } = renderSidebar(SEVEN_ENVS, ['prod:default']);

    // Narrow to the two "ec*" platforms, then select all -> existing prod kept, ec2/ecs added.
    fireEvent.change(screen.getByTestId('environmentSearch'), { target: { value: 'ec' } });
    fireEvent.click(screen.getByTestId('environmentSelectAll'));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        environments: expect.arrayContaining(['prod:default', 'ec2:asg', 'ecs:cluster']),
      })
    );
    expect(onFiltersChange.mock.calls[0][0].environments).toHaveLength(3);
  });

  it('Clear all empties the selection', () => {
    const { onFiltersChange } = renderSidebar(SEVEN_ENVS, ['prod:default', 'dev:default']);

    fireEvent.click(screen.getByTestId('environmentClearAll'));

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ environments: [] }));
  });
});
