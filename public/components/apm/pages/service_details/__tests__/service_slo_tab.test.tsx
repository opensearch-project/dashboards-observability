/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SloHealthState, SloSummary } from '../../../../../../common/slo/slo_types';
import {
  rollupSloHealth,
  SloHealthAccessError,
  SloHealthBucket,
} from '../../slos/slo_health_summary';

// Stub coreRefs before importing the tab so the navigate helpers resolve.
const mockNavigateToApp = jest.fn();
jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: {
    application: { navigateToApp: (...args: unknown[]) => mockNavigateToApp(...args) },
    http: { basePath: { prepend: (p: string) => p } },
  },
}));

import { ServiceSloTab, SloTabLabel } from '../service_slo_tab';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSummary(
  overrides: Partial<SloSummary> & Pick<SloSummary, 'id' | 'service'>
): SloSummary {
  const { id, service, status, name, ...rest } = overrides;
  const state: SloHealthState = status?.state ?? 'ok';
  return {
    id,
    datasourceId: 'ds-1',
    datasourceType: 'prometheus',
    name: name ?? id,
    enabled: true,
    mode: 'active',
    service,
    owner: { teams: [] },
    sliNodeType: 'single',
    sliBackend: 'prometheus',
    sliLeafType: 'availability',
    objectiveCount: 1,
    worstTarget: 0.99,
    window: { type: 'rolling', duration: '28d' },
    labels: {},
    status: {
      sloId: id,
      objectives: [
        {
          objectiveName: 'obj1',
          currentValue: 0.995,
          currentValueUnit: 'ratio',
          attainment: 0.995,
          errorBudgetRemaining: 0.5,
          state,
        },
      ],
      state,
      firingCount: 0,
      ruleCount: 1,
      computedAt: '2026-05-01T00:00:00Z',
      ...(status ?? {}),
    },
    ...rest,
  } as SloSummary;
}

const SERVICE = 'payments-api';

/**
 * Build the bucket the parent hook would compute for this service. Using the
 * real `rollupSloHealth` keeps the test coupled to the production hook math
 * rather than a hand-rolled bucket shape, so when M5A-style classifier tweaks
 * arrive the tests follow automatically.
 */
function bucketFor(service: string, summaries: SloSummary[]): SloHealthBucket | undefined {
  return rollupSloHealth([service], summaries).bySvc.get(service);
}

interface RenderOpts {
  bucket?: SloHealthBucket | undefined;
  isLoading?: boolean;
  error?: SloHealthAccessError | undefined;
  refetch?: () => void;
}

function renderTab(opts: RenderOpts = {}) {
  const refetch = opts.refetch ?? jest.fn();
  return {
    refetch,
    ...render(
      <ServiceSloTab
        serviceName={SERVICE}
        bucket={opts.bucket}
        isLoading={opts.isLoading ?? false}
        error={opts.error}
        refetch={refetch}
      />
    ),
  };
}

// ---------------------------------------------------------------------------
// Tab-label badge
// ---------------------------------------------------------------------------

describe('SloTabLabel', () => {
  it('renders plain label when breached=0', () => {
    render(<SloTabLabel breached={0} />);
    expect(screen.getByText('SLOs')).toBeInTheDocument();
    expect(screen.queryByTestId('serviceDetailsTabSlosBadge')).toBeNull();
  });

  it('renders a notification badge with the breached count when breached>0', () => {
    render(<SloTabLabel breached={3} />);
    const badge = screen.getByTestId('serviceDetailsTabSlosBadge');
    expect(badge).toHaveTextContent('3');
  });

  it('wraps the label in an aria-label span when badge is present', () => {
    render(<SloTabLabel breached={1} />);
    expect(screen.getByLabelText('SLOs, 1 breached')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ServiceSloTab — state-by-state rendering
// ---------------------------------------------------------------------------

describe('ServiceSloTab — empty state', () => {
  beforeEach(() => {
    mockNavigateToApp.mockClear();
  });

  it('renders the EuiEmptyPrompt when no SLOs are tracked for this service', () => {
    renderTab({ bucket: bucketFor(SERVICE, []) });
    expect(screen.getByTestId('serviceSloTabEmptyPrompt')).toBeInTheDocument();
    expect(screen.getByText('No SLOs tracked for this service')).toBeInTheDocument();
    expect(screen.queryByTestId('serviceSloTabMissingPairCallout')).toBeNull();
  });

  it('primary empty-state action navigates to scoped suggest page', () => {
    renderTab({ bucket: bucketFor(SERVICE, []) });
    fireEvent.click(screen.getByTestId('serviceSloTabEmptyPromptPrimary'));
    expect(mockNavigateToApp).toHaveBeenLastCalledWith('observability-apm-slo', {
      path: `#/slos/suggest?source=apm&services=${encodeURIComponent(SERVICE)}`,
    });
  });

  it('secondary empty-state action navigates to create wizard', () => {
    renderTab({ bucket: bucketFor(SERVICE, []) });
    fireEvent.click(screen.getByTestId('serviceSloTabEmptyPromptSecondary'));
    expect(mockNavigateToApp).toHaveBeenLastCalledWith('observability-apm-slo', {
      path: '#/slos/create',
    });
  });
});

describe('ServiceSloTab — complete canonical pair', () => {
  it('renders chips and table, no missing-pair callout', () => {
    const summaries = [
      makeSummary({
        id: 'a',
        service: SERVICE,
        name: 'availability SLO',
        sliLeafType: 'availability',
        status: {
          sloId: 'a',
          objectives: [],
          state: 'ok',
          firingCount: 0,
          ruleCount: 1,
          computedAt: '',
        },
      }),
      makeSummary({
        id: 'b',
        service: SERVICE,
        name: 'latency SLO',
        sliLeafType: 'latency_threshold',
        status: {
          sloId: 'b',
          objectives: [],
          state: 'ok',
          firingCount: 0,
          ruleCount: 1,
          computedAt: '',
        },
      }),
    ];
    renderTab({ bucket: bucketFor(SERVICE, summaries) });
    expect(screen.getByTestId('serviceSloTabTable')).toBeInTheDocument();
    expect(screen.getByTestId('serviceSloTabChipRow')).toBeInTheDocument();
    expect(screen.getByTestId('serviceSloTabFootnote')).toBeInTheDocument();
    expect(screen.queryByTestId('serviceSloTabMissingPairCallout')).toBeNull();
  });
});

describe('ServiceSloTab — missing-pair variants', () => {
  beforeEach(() => {
    mockNavigateToApp.mockClear();
  });

  it('shows "Latency SLO missing" when only availability is present', () => {
    const summaries = [makeSummary({ id: 'a', service: SERVICE, sliLeafType: 'availability' })];
    renderTab({ bucket: bucketFor(SERVICE, summaries) });
    const callout = screen.getByTestId('serviceSloTabMissingPairCallout');
    expect(callout).toHaveTextContent('Latency SLO missing');
  });

  it('shows "Availability SLO missing" when only latency is present', () => {
    const summaries = [
      makeSummary({ id: 'b', service: SERVICE, sliLeafType: 'latency_threshold' }),
    ];
    renderTab({ bucket: bucketFor(SERVICE, summaries) });
    const callout = screen.getByTestId('serviceSloTabMissingPairCallout');
    expect(callout).toHaveTextContent('Availability SLO missing');
  });

  it('shows "Canonical pair incomplete" when neither canonical kind is present but other SLOs exist', () => {
    // A custom SLI that doesn't classify as availability or latency.
    const summaries = [makeSummary({ id: 'c', service: SERVICE, sliLeafType: 'custom' })];
    renderTab({ bucket: bucketFor(SERVICE, summaries) });
    const callout = screen.getByTestId('serviceSloTabMissingPairCallout');
    expect(callout).toHaveTextContent('Canonical pair incomplete');
  });

  it('missing-pair CTA scopes to this one service', () => {
    const summaries = [makeSummary({ id: 'a', service: SERVICE, sliLeafType: 'availability' })];
    renderTab({ bucket: bucketFor(SERVICE, summaries) });
    fireEvent.click(screen.getByTestId('serviceSloTabMissingPairCta'));
    expect(mockNavigateToApp).toHaveBeenLastCalledWith('observability-apm-slo', {
      path: `#/slos/suggest?source=apm&services=${encodeURIComponent(SERVICE)}`,
    });
  });
});

describe('ServiceSloTab — Current column placeholder for non-reporting states', () => {
  it('renders an "Awaiting data" badge (and no 0.00%) when state is no_data', () => {
    const summary = makeSummary({
      id: 'nodata-1',
      service: SERVICE,
      name: 'availability SLO',
      sliLeafType: 'availability',
      status: {
        sloId: 'nodata-1',
        // Zero-value objective paired with no_data is the exact shape the
        // listing projection emits for fresh SLOs — the regression under test
        // is that we were rendering `0.00%` from this row and users read it
        // as a real measurement.
        objectives: [
          {
            objectiveName: 'obj1',
            currentValue: 0,
            currentValueUnit: 'ratio',
            attainment: 0,
            errorBudgetRemaining: 1,
            state: 'no_data',
          },
        ],
        state: 'no_data',
        firingCount: 0,
        ruleCount: 1,
        computedAt: '',
      },
    });
    renderTab({ bucket: bucketFor(SERVICE, [summary]) });
    const placeholder = screen.getByTestId('serviceSloTabCurrentPlaceholder-nodata-1');
    expect(placeholder).toHaveTextContent('Awaiting data');
    expect(screen.queryByText('0.00%')).toBeNull();
  });
});

describe('ServiceSloTab — error + 403', () => {
  it('renders the forbidden callout and hides retry when error is forbidden', () => {
    renderTab({ error: { kind: 'forbidden' } });
    expect(screen.getByTestId('serviceSloTabForbiddenCallout')).toBeInTheDocument();
    expect(screen.queryByTestId('serviceSloTabErrorRetry')).toBeNull();
  });

  it('renders the generic error callout with retry on non-403 errors', () => {
    const refetch = jest.fn();
    renderTab({ error: { kind: 'generic', message: 'boom' }, refetch });
    expect(screen.getByTestId('serviceSloTabErrorCallout')).toBeInTheDocument();
    const retry = screen.getByTestId('serviceSloTabErrorRetry');
    fireEvent.click(retry);
    expect(refetch).toHaveBeenCalled();
  });
});

describe('ServiceSloTab — loading grace timer', () => {
  it('waits ~150ms before showing the skeleton', () => {
    jest.useFakeTimers();
    try {
      renderTab({ isLoading: true });
      expect(screen.queryByTestId('serviceSloTabLoading')).toBeNull();
      act(() => {
        jest.advanceTimersByTime(160);
      });
      expect(screen.getByTestId('serviceSloTabLoading')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
