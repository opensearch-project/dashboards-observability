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
  error: null as Error | null,
  scopeFellBack: false,
  refetch: jest.fn(),
};
const mockRedMetricsArgs = jest.fn();
jest.mock('../../../shared/hooks/use_services_red_metrics', () => ({
  useServicesRedMetrics: (args: unknown) => {
    mockRedMetricsArgs(args);
    return mockMetricsReturn;
  },
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
  ActiveFilterBadges: ({
    filters,
    onClearAll,
  }: {
    filters: Array<{ key: string; category: string; values: string[]; onRemove: () => void }>;
    onClearAll: () => void;
  }) => (
    <div data-test-subj="stub-ActiveFilterBadges">
      {filters.map((f) => `${f.category}: ${f.values.join(', ')}`).join(' | ')}
      {filters.map((f) => (
        <button key={f.key} data-test-subj={`stub-remove-${f.key}`} onClick={f.onRemove} />
      ))}
      <button data-test-subj="stub-clearAll" onClick={onClearAll} />
    </div>
  ),
  FilterBadge: () => null,
}));
const mockSloHealthPanel = jest.fn();
jest.mock('../slo_health_panel', () => ({
  SloHealthCell: () => <div />,
  SloHealthPanel: (props: unknown) => {
    mockSloHealthPanel(props);
    return <div />;
  },
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
  availableGroupByAttributes: Record<string, string[]> = {},
  servicesOverrides: Record<string, unknown> = {}
) => {
  mockUseServices.mockReturnValue({
    data: environments.map((env, i) => makeService(env, `svc-${i}`)),
    isLoading: false,
    error: null,
    availableGroupByAttributes,
    refetch: jest.fn(),
    ...servicesOverrides,
  });
  return render(
    <ServicesHome
      chrome={{ setBreadcrumbs: jest.fn() }}
      parentBreadcrumb={{ text: 'APM', href: '#/' }}
      onServiceClick={jest.fn()}
    />
  );
};

// Seven distinct environments; sorted -> dev, ec2, ecs, eks, lambda, prod, staging
const SEVEN_ENVS = ['prod', 'dev', 'staging', 'eks', 'ec2', 'ecs', 'lambda'];

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

  const tableRows = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent ?? '');

  it('lists each environment value separately, even when they share a platform prefix', () => {
    renderHome(['dev', 'fvt', 'eks:cluster/dev', 'eks:cluster/fvt', 'generic:default']);

    const labels = within(envGroup())
      .getAllByRole('checkbox')
      .map((el) => el.closest('div')?.textContent);
    expect(labels).toEqual(['dev', 'eks:cluster/dev', 'eks:cluster/fvt', 'fvt', 'generic']);
  });

  it('filters the catalog to the selected environment only', () => {
    mockUseServices.mockReturnValue({
      data: [
        makeService('fvt', 'checkout'),
        makeService('dev', 'checkout'),
        makeService('fvt', 'cart'),
      ],
      isLoading: false,
      error: null,
      availableGroupByAttributes: {},
      refetch: jest.fn(),
    });
    render(
      <ServicesHome
        chrome={{ setBreadcrumbs: jest.fn() }}
        parentBreadcrumb={{ text: 'APM', href: '#/' }}
        onServiceClick={jest.fn()}
      />
    );
    expect(tableRows()).toHaveLength(3);

    fireEvent.click(within(envGroup()).getByLabelText('dev'));

    const rows = tableRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('checkout');
    expect(rows[0]).toContain('dev');
    expect(screen.getByTestId('stub-ActiveFilterBadges')).toHaveTextContent(
      `${servicesI18nTexts.filters.environment}: dev`
    );
    // The metrics queries are scoped to the exact environment, not its platform.
    const lastArgs = mockRedMetricsArgs.mock.calls[mockRedMetricsArgs.mock.calls.length - 1][0];
    expect(JSON.stringify(lastArgs)).toContain('environment=~\\"dev\\"');
  });

  it('shows the full environment value in the table', () => {
    renderHome(['eks:cluster/dev']);
    expect(tableRows()[0]).toContain('eks:cluster/dev');
  });
});

describe('ServicesHome — Node type column and filter', () => {
  beforeEach(() => jest.clearAllMocks());

  const renderTyped = (rows: Array<{ serviceName: string; type?: string }>) => {
    mockUseServices.mockReturnValue({
      data: rows.map((r) => ({ ...r, environment: 'generic:default', groupByAttributes: {} })),
      isLoading: false,
      error: null,
      availableGroupByAttributes: {},
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
  const typeHeader = () =>
    screen
      .queryAllByRole('columnheader')
      .find((th) => th.textContent?.trim() === servicesI18nTexts.table.type);
  const rowNames = () =>
    screen.queryAllByTestId(/^serviceLink-/).map((el) => el.textContent?.trim());

  it('service-only data (no dependency nodes) renders no Type column or filter', () => {
    renderTyped([
      { serviceName: 'cart', type: 'service' },
      { serviceName: 'checkout', type: 'service' },
    ]);

    expect(typeHeader()).toBeUndefined();
    expect(screen.queryByTestId('typeCheckboxGroup')).not.toBeInTheDocument();
    expect(rowNames()).toEqual(['cart', 'checkout']);
  });

  it('with dependency nodes, shows services only by default and does not scope in dependencies', () => {
    renderTyped([
      { serviceName: 'cart', type: 'service' },
      { serviceName: 'postgresql:orders-db', type: 'database' },
    ]);

    expect(rowNames()).toEqual(['cart']);
    // The default is the baseline, not a removable filter badge.
    expect(screen.queryByTestId('stub-ActiveFilterBadges')?.textContent ?? '').not.toContain(
      `${servicesI18nTexts.table.type}:`
    );
    // The (heavy, whole-range) dependency metric queries are not issued.
    const args = mockRedMetricsArgs.mock.calls.slice(-1)[0][0];
    expect(args.scopeFilters.runDependencies).toBe(false);
    expect(args.scopeServices.map((s: { serviceName: string }) => s.serviceName)).toEqual(['cart']);
  });

  it('removing the Type badge, or Clear all, returns to services only (not every type)', () => {
    renderTyped([
      { serviceName: 'cart', type: 'service' },
      { serviceName: 'postgresql:orders-db', type: 'database' },
    ]);
    const group = within(screen.getByTestId('typeCheckboxGroup'));
    const lastScope = () => mockRedMetricsArgs.mock.calls.slice(-1)[0][0].scopeFilters;

    fireEvent.click(group.getByLabelText('Database'));
    expect(rowNames()).toEqual(['cart', 'postgresql:orders-db']);
    fireEvent.click(screen.getByTestId('stub-remove-type'));
    expect(rowNames()).toEqual(['cart']);
    expect(lastScope().runDependencies).toBe(false);

    fireEvent.click(group.getByLabelText('Database'));
    fireEvent.click(screen.getByTestId('stub-clearAll'));
    expect(rowNames()).toEqual(['cart']);
    expect(lastScope().runDependencies).toBe(false);
  });

  it('with dependency nodes, filters by type and shows a Type badge', () => {
    renderTyped([
      { serviceName: 'cart', type: 'service' },
      { serviceName: 'postgresql:orders-db', type: 'database' },
      { serviceName: 'kafka:orders', type: 'messaging' },
    ]);

    expect(typeHeader()).toBeDefined();
    const group = within(screen.getByTestId('typeCheckboxGroup'));
    fireEvent.click(group.getByLabelText('Service'));
    fireEvent.click(group.getByLabelText('Database'));

    expect(rowNames()).toEqual(['postgresql:orders-db']);
    expect(screen.getByTestId('stub-ActiveFilterBadges')).toHaveTextContent(
      `${servicesI18nTexts.table.type}: Database`
    );
  });

  it('lists unknown types in the filter and keeps them out of "Service"', () => {
    renderTyped([
      { serviceName: 'cart', type: 'service' },
      { serviceName: 'memcached:sessions', type: 'cache' },
    ]);

    const group = within(screen.getByTestId('typeCheckboxGroup'));
    // "Service" is selected by default.
    expect(rowNames()).toEqual(['cart']);
    fireEvent.click(group.getByLabelText('Service'));
    fireEvent.click(group.getByLabelText('Other dependency'));
    expect(rowNames()).toEqual(['memcached:sessions']);
  });

  it('offers only instrumented services to the SLO rollup', () => {
    const refs = jest.requireMock('../../../../../framework/core_refs').coreRefs;
    refs.sloEnabled = true;
    try {
      renderTyped([
        { serviceName: 'cart', type: 'service' },
        { serviceName: 'kafka:orders', type: 'messaging' },
        { serviceName: 'checkout' },
      ]);

      const panelCalls = mockSloHealthPanel.mock.calls;
      expect(panelCalls.length).toBeGreaterThan(0);
      expect(panelCalls[panelCalls.length - 1][0].allServices).toEqual(['cart', 'checkout']);
    } finally {
      refs.sloEnabled = false;
    }
  });

  it('sorting by Type fetches sparklines for the rows actually shown', () => {
    renderTyped([
      { serviceName: 'a-service', type: 'service' },
      { serviceName: 'b-broker', type: 'messaging' },
      { serviceName: 'c-db', type: 'database' },
    ]);

    // Show every type (the default is services only), then sort by Type.
    fireEvent.click(within(screen.getByTestId('typeCheckboxGroup')).getByLabelText('Service'));
    const header = typeHeader();
    expect(header).toBeDefined();
    fireEvent.click(within(header as HTMLElement).getByRole('button'));

    const shown = rowNames();
    const sparkline = mockRedMetricsArgs.mock.calls
      .slice(-1)[0][0]
      .sparklineServices.map((s: { serviceName: string }) => s.serviceName);
    expect(shown).toEqual(['c-db', 'b-broker', 'a-service']);
    expect(sparkline).toEqual(shown);
  });
});

describe('ServicesHome — metrics notices', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    mockMetricsReturn.error = null;
    mockMetricsReturn.scopeFellBack = false;
  });

  it('warns when a metrics query failed and shows "-" for the missing values', () => {
    mockMetricsReturn.error = new Error('Read timed out');
    renderHome(['prod:default']);
    expect(screen.getByTestId('servicesMetricsFailedCallout')).toBeInTheDocument();
    expect(screen.queryByText('0 ms')).not.toBeInTheDocument();
  });

  it('explains when the filter was too broad to narrow the queries', () => {
    mockMetricsReturn.scopeFellBack = true;
    renderHome(['prod:default']);
    expect(screen.getByTestId('servicesBroadFilterCallout')).toBeInTheDocument();
  });

  it('shows no notice when metrics loaded', () => {
    renderHome(['prod:default']);
    expect(screen.queryByTestId('servicesMetricsFailedCallout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('servicesBroadFilterCallout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('servicesCatalogPartialCallout')).not.toBeInTheDocument();
  });

  it('says so when the service list is partial', () => {
    renderHome(['prod:default'], {}, { truncated: true });
    expect(screen.getByTestId('servicesCatalogPartialCallout')).toHaveTextContent(
      'Narrow the time range'
    );
  });
});
