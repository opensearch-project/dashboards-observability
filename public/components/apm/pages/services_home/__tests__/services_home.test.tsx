/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

// ---- Hook mocks -----------------------------------------------------------

const mockUseServices = jest.fn();
jest.mock('../../../shared/hooks/use_services', () => ({
  useServices: (...args: unknown[]) => mockUseServices(...args),
}));

// Return STABLE references from these hook mocks. ServicesHome derives
// `metricRanges` (a useMemo keyed on `metricsMap`) and an effect syncs it into
// latency/throughput state — a fresh object/Map each render would recompute the
// memo every render and loop that effect ("Maximum update depth exceeded").
const mockMetricsReturn = {
  metricsMap: new Map(),
  isLoading: false,
  error: null,
  refetch: jest.fn(),
};
jest.mock('../../../shared/hooks/use_services_red_metrics', () => ({
  useServicesRedMetrics: () => mockMetricsReturn,
  // `services_home.tsx` keys the metrics map with `serviceNodeKey`. Mirror the
  // real implementation (`${serviceName}::${environment ?? ''}`) so the table
  // cell renderers don't throw "serviceNodeKey is not a function".
  serviceNodeKey: (serviceName: string, environment?: string) =>
    `${serviceName}::${environment ?? ''}`,
}));

const mockTimeRange = { from: 'now-15m', to: 'now' };
const mockSetTimeRange = jest.fn();
jest.mock('../../../shared/hooks/use_persistent_time_range', () => ({
  usePersistentTimeRange: () => [mockTimeRange, mockSetTimeRange],
}));

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: () => ({ config: { serviceMapDataset: { id: 'x', title: 'idx' } } }),
}));

const mockSloReturn = {
  bySvc: new Map(),
  aggregate: {},
  isLoading: false,
  error: undefined,
  refetch: jest.fn(),
};
jest.mock('../../slos/slo_health_summary', () => ({
  useServiceSloHealth: () => mockSloReturn,
  toSloHealthAccessError: jest.fn(),
}));

jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: { http: undefined, sloEnabled: false },
}));

jest.mock('../../slos/slo_api_client', () => ({
  SloApiClient: jest.fn(),
}));

// ---- Child-component stubs (rendered but irrelevant to the filter) --------

const stub = (name: string) => ({ [name]: () => <div data-test-subj={`stub-${name}`} /> });

jest.mock('../../../shared/components/apm_page_header', () => stub('ApmPageHeader'));
jest.mock('../../../shared/components/empty_state', () => stub('EmptyState'));
jest.mock('../../../shared/components/language_icon', () => stub('LanguageIcon'));
jest.mock('../../../shared/components/metric_sparkline', () => stub('MetricSparkline'));
jest.mock('../../../shared/components/fault_widgets/top_services_by_fault_rate', () =>
  stub('TopServicesByFaultRate')
);
jest.mock('../../../shared/components/fault_widgets/top_dependencies_by_fault_rate', () =>
  stub('TopDependenciesByFaultRate')
);
jest.mock('../../../shared/components/service_correlations_flyout', () =>
  stub('ServiceCorrelationsFlyout')
);
jest.mock('../../../shared/components/active_filter_badges', () => ({
  ActiveFilterBadges: () => <div data-test-subj="stub-ActiveFilterBadges" />,
  FilterBadge: () => null,
}));
jest.mock('../slo_health_panel', () => ({
  SloHealthCell: () => <div />,
  SloHealthPanel: () => <div />,
  SLO_HEALTH_COLUMN_HEADER: 'SLO',
  SLO_HEALTH_COLUMN_HEADER_TIP: '',
  SLO_HEALTH_COLUMN_WIDTH: '100px',
}));

// Keep the real logic exports (ErrorRateThreshold, matchesErrorRateThreshold,
// THRESHOLD_LABELS) and only stub the rendered filter widgets.
jest.mock('../../../shared/components/filters', () => {
  const actual = jest.requireActual('../../../shared/components/filters');
  return {
    ...actual,
    LatencyRangeFilter: () => <div data-test-subj="stub-LatencyRangeFilter" />,
    ThroughputRangeFilter: () => <div data-test-subj="stub-ThroughputRangeFilter" />,
    FailureRateThresholdFilter: () => <div data-test-subj="stub-FailureRateThresholdFilter" />,
  };
});

import { ServicesHome } from '../services_home';
import { servicesI18nTexts } from '../services_home_i18n';

const makeService = (environment: string, serviceName: string) => ({
  serviceName,
  environment,
  groupByAttributes: {},
});

const renderHome = (
  environments: string[],
  availableGroupByAttributes: Record<string, string[]> = {}
) => {
  mockUseServices.mockReturnValue({
    data: environments.map((env, i) => makeService(env, `svc-${i}`)),
    isLoading: false,
    error: null,
    availableGroupByAttributes,
    refetch: jest.fn(),
  });
  return render(
    <ServicesHome
      chrome={{ setBreadcrumbs: jest.fn() }}
      parentBreadcrumb={{ text: 'APM', href: '#/' }}
      onServiceClick={jest.fn()}
    />
  );
};

// Seven distinct platforms (before ':'); sorted -> dev, ec2, ecs, eks, lambda, prod, staging
const SEVEN_ENVS = [
  'prod:default',
  'dev:default',
  'staging:default',
  'eks:cluster/ns',
  'ec2:asg',
  'ecs:cluster',
  'lambda:default',
];

const envGroup = () => screen.getByTestId('environmentCheckboxGroup');
const checkedIds = () =>
  Array.from(envGroup().querySelectorAll('input:checked')).map((el) => (el as HTMLInputElement).id);

describe('ServicesHome — Environment filter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('caps the list at 5 and toggles the full list with +N more / Show less', () => {
    renderHome(SEVEN_ENVS);

    // Default: first 5 of the sorted platforms.
    expect(within(envGroup()).getByText('dev')).toBeInTheDocument();
    expect(within(envGroup()).getByText('lambda')).toBeInTheDocument();
    expect(within(envGroup()).queryByText('prod')).not.toBeInTheDocument();
    expect(within(envGroup()).queryByText('staging')).not.toBeInTheDocument();

    // Expand.
    fireEvent.click(screen.getByTestId('environmentShowMore'));
    expect(within(envGroup()).getByText('prod')).toBeInTheDocument();
    expect(within(envGroup()).getByText('staging')).toBeInTheDocument();

    // Collapse.
    fireEvent.click(screen.getByTestId('environmentShowMore'));
    expect(within(envGroup()).queryByText('staging')).not.toBeInTheDocument();
  });

  it('search narrows the list case-insensitively', () => {
    renderHome(SEVEN_ENVS);

    fireEvent.change(screen.getByTestId('environmentSearch'), { target: { value: 'EC' } });

    expect(within(envGroup()).getByText('ec2')).toBeInTheDocument();
    expect(within(envGroup()).getByText('ecs')).toBeInTheDocument();
    expect(within(envGroup()).queryByText('dev')).not.toBeInTheDocument();
  });

  it('shows noMatchingValues when a search matches nothing', () => {
    renderHome(SEVEN_ENVS);

    fireEvent.change(screen.getByTestId('environmentSearch'), { target: { value: 'zzzzz' } });

    expect(screen.getByText(servicesI18nTexts.filters.noMatchingValues)).toBeInTheDocument();
    expect(screen.queryByTestId('environmentCheckboxGroup')).not.toBeInTheDocument();
  });

  it('shows noEnvironments when services exist but none carry an environment', () => {
    // Services must exist (otherwise the page renders EmptyState instead of the
    // filter sidebar); their environment is empty so no platform is derived.
    renderHome(['', '']);

    expect(screen.getByText(servicesI18nTexts.filters.noEnvironments)).toBeInTheDocument();
    expect(screen.queryByTestId('environmentSearch')).not.toBeInTheDocument();
  });

  it('Select all selects the currently-filtered subset; Clear all clears everything', () => {
    renderHome(SEVEN_ENVS);

    // Narrow to the two "ec*" platforms, then select all -> only those checked.
    fireEvent.change(screen.getByTestId('environmentSearch'), { target: { value: 'ec' } });
    fireEvent.click(screen.getByTestId('environmentSelectAll'));
    expect(checkedIds().sort()).toEqual(['ec2', 'ecs']);

    // A selection made under a different search survives a new Select all
    // (merge semantics): search "dev", select all -> dev added, ec2/ecs kept.
    fireEvent.change(screen.getByTestId('environmentSearch'), { target: { value: 'dev' } });
    fireEvent.click(screen.getByTestId('environmentSelectAll'));
    fireEvent.change(screen.getByTestId('environmentSearch'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('environmentShowMore')); // reveal all so ec2/ecs render
    expect(checkedIds().sort()).toEqual(['dev', 'ec2', 'ecs']);

    // Clear all wipes the map.
    fireEvent.click(screen.getByTestId('environmentClearAll'));
    expect(checkedIds()).toEqual([]);
  });
});
