/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

// Stub coreRefs so the navigate helpers don't explode on mount. `jest.mock`
// is hoisted above imports, so the captured variable has to be `mock`-
// prefixed to satisfy the hoist guard. `clearMocks: true` in the plugin's
// jest config only resets call history — the jest.fn() itself survives.
const mockNavigateToApp = jest.fn();
jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: {
    application: { navigateToApp: (...args: unknown[]) => mockNavigateToApp(...args) },
    http: { basePath: { prepend: (p: string) => p } },
  },
}));

import { SloHealthCell, SloHealthPanel } from '../slo_health_panel';
import { navigateToSloListing, navigateToSloSuggest } from '../../../shared/utils/navigation_utils';
import type { SloHealthBucket } from '../../slos/slo_health_summary';

function makeBucket(overrides: Partial<SloHealthBucket> = {}): SloHealthBucket {
  return {
    total: 0,
    ok: 0,
    warning: 0,
    breached: 0,
    noData: 0,
    stale: 0,
    disabled: 0,
    rulesMissing: 0,
    hasAvailability: false,
    hasLatency: false,
    missingCanonicalPair: true,
    slos: [],
    ...overrides,
  };
}

describe('navigate helpers', () => {
  beforeEach(() => {
    mockNavigateToApp.mockClear();
  });

  it('navigateToSloSuggest builds `source=apm&services=...` path', () => {
    navigateToSloSuggest(['foo', 'bar']);
    expect(mockNavigateToApp).toHaveBeenCalledWith('observability-apm-slo', {
      path: '#/slos/suggest?source=apm&services=foo%2Cbar',
    });
  });

  it('navigateToSloSuggest omits services param when empty', () => {
    navigateToSloSuggest([]);
    expect(mockNavigateToApp).toHaveBeenCalledWith('observability-apm-slo', {
      path: '#/slos/suggest?source=apm',
    });
  });

  it('navigateToSloListing builds `?service=<csv>` path when scoped', () => {
    navigateToSloListing(['foo', 'bar']);
    expect(mockNavigateToApp).toHaveBeenCalledWith('observability-apm-slo', {
      path: '#/slos?service=foo%2Cbar',
    });
  });

  it('navigateToSloListing leaves the path unscoped when list is empty', () => {
    navigateToSloListing([]);
    expect(mockNavigateToApp).toHaveBeenCalledWith('observability-apm-slo', {
      path: '#/slos',
    });
  });
});

// ---------------------------------------------------------------------------
// SloHealthPanel
// ---------------------------------------------------------------------------

describe('SloHealthPanel', () => {
  beforeEach(() => {
    mockNavigateToApp.mockClear();
  });

  it('renders chips for each state with counts when SLOs exist', () => {
    render(
      <SloHealthPanel
        aggregate={makeBucket({
          total: 5,
          ok: 2,
          breached: 1,
          warning: 1,
          noData: 1,
          hasAvailability: true,
          hasLatency: false,
          missingCanonicalPair: true,
        })}
        bySvc={new Map([['foo', makeBucket({ missingCanonicalPair: true })]])}
        allServices={['foo']}
        isLoading={false}
        error={undefined}
        onRetry={jest.fn()}
      />
    );
    expect(screen.getByTestId('sloHealthPanel')).toBeInTheDocument();
    expect(screen.getByTestId('sloHealthPanelChip-breached')).toHaveTextContent('1 breached');
    expect(screen.getByTestId('sloHealthPanelChip-warning')).toHaveTextContent('1 warning');
    expect(screen.getByTestId('sloHealthPanelChip-noData')).toHaveTextContent('1 no data');
    expect(screen.getByTestId('sloHealthPanelChip-ok')).toHaveTextContent('2 OK');
    expect(screen.queryByTestId('sloHealthPanelChip-disabled')).toBeNull();
  });

  it('renders only non-zero chips when some tiers are empty', () => {
    render(
      <SloHealthPanel
        aggregate={makeBucket({
          total: 5,
          ok: 5,
          hasAvailability: true,
          hasLatency: true,
          missingCanonicalPair: false,
        })}
        bySvc={new Map([['foo', makeBucket({ missingCanonicalPair: false })]])}
        allServices={['foo']}
        isLoading={false}
        error={undefined}
        onRetry={jest.fn()}
      />
    );
    expect(screen.getByTestId('sloHealthPanelChip-ok')).toHaveTextContent('5 OK');
    expect(screen.queryByTestId('sloHealthPanelChip-breached')).toBeNull();
    expect(screen.queryByTestId('sloHealthPanelChip-warning')).toBeNull();
    expect(screen.queryByTestId('sloHealthPanelChip-noData')).toBeNull();
    expect(screen.queryByTestId('sloHealthPanelChip-disabled')).toBeNull();
  });

  it('collapses the left column to an empty-state message when aggregate.total=0', () => {
    render(
      <SloHealthPanel
        aggregate={makeBucket()}
        bySvc={new Map([['foo', makeBucket()]])}
        allServices={['foo']}
        isLoading={false}
        error={undefined}
        onRetry={jest.fn()}
      />
    );
    expect(screen.getByTestId('sloHealthPanelEmpty')).toHaveTextContent(
      'No SLOs tracked for these services.'
    );
    expect(screen.queryByTestId('sloHealthPanelChip-breached')).toBeNull();
  });

  it('primary CTA scopes to services with missingCanonicalPair=true only', () => {
    const bySvc = new Map<string, SloHealthBucket>();
    bySvc.set('foo', makeBucket({ missingCanonicalPair: true }));
    bySvc.set('bar', makeBucket({ missingCanonicalPair: false }));
    bySvc.set('baz', makeBucket({ missingCanonicalPair: true }));

    render(
      <SloHealthPanel
        aggregate={makeBucket({ total: 3, ok: 3 })}
        bySvc={bySvc}
        allServices={['foo', 'bar', 'baz']}
        isLoading={false}
        error={undefined}
        onRetry={jest.fn()}
      />
    );
    const cta = screen.getByTestId('sloHealthPanelCta');
    expect(cta).toHaveTextContent('Suggest SLOs for 2 services');
    fireEvent.click(cta);
    expect(mockNavigateToApp).toHaveBeenLastCalledWith('observability-apm-slo', {
      path: '#/slos/suggest?source=apm&services=foo%2Cbaz',
    });
  });

  it('secondary CTA carries the full service list currently shown', () => {
    render(
      <SloHealthPanel
        aggregate={makeBucket({ total: 1 })}
        bySvc={new Map([['foo', makeBucket()]])}
        allServices={['foo', 'bar']}
        isLoading={false}
        error={undefined}
        onRetry={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('sloHealthPanelViewAll'));
    expect(mockNavigateToApp).toHaveBeenLastCalledWith('observability-apm-slo', {
      path: '#/slos?service=foo%2Cbar',
    });
  });

  it('disables the primary CTA when all services have a canonical pair', () => {
    render(
      <SloHealthPanel
        aggregate={makeBucket({ total: 2, ok: 2 })}
        bySvc={
          new Map([
            ['foo', makeBucket({ missingCanonicalPair: false })],
            ['bar', makeBucket({ missingCanonicalPair: false })],
          ])
        }
        allServices={['foo', 'bar']}
        isLoading={false}
        error={undefined}
        onRetry={jest.fn()}
      />
    );
    expect(screen.getByTestId('sloHealthPanelCta')).toBeDisabled();
  });

  it('does not show the skeleton before the 150ms grace timer elapses', () => {
    jest.useFakeTimers();
    render(
      <SloHealthPanel
        aggregate={makeBucket()}
        bySvc={new Map()}
        allServices={[]}
        isLoading
        error={undefined}
        onRetry={jest.fn()}
      />
    );
    expect(screen.queryByTestId('sloHealthPanelSkeleton')).toBeNull();
    expect(screen.getByTestId('sloHealthPanelLoadingPlaceholder')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(160);
    });
    expect(screen.getByTestId('sloHealthPanelSkeleton')).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('renders an inline error with retry link on generic failure', () => {
    const onRetry = jest.fn();
    render(
      <SloHealthPanel
        aggregate={makeBucket()}
        bySvc={new Map()}
        allServices={[]}
        isLoading={false}
        error={{ kind: 'generic', message: 'boom' }}
        onRetry={onRetry}
      />
    );
    expect(screen.getByTestId('sloHealthPanelError')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sloHealthPanelRetry'));
    expect(onRetry).toHaveBeenCalled();
    // Primary CTA still rendered (error is recoverable).
    expect(screen.queryByTestId('sloHealthPanelCta')).toBeNull();
    expect(screen.getByTestId('sloHealthPanelViewAll')).toBeInTheDocument();
  });

  it('collapses to a permission callout on forbidden error', () => {
    render(
      <SloHealthPanel
        aggregate={makeBucket()}
        bySvc={new Map()}
        allServices={[]}
        isLoading={false}
        error={{ kind: 'forbidden' }}
        onRetry={jest.fn()}
      />
    );
    expect(screen.getByTestId('sloHealthPanelForbidden')).toBeInTheDocument();
    expect(screen.queryByTestId('sloHealthPanelCta')).toBeNull();
    expect(screen.queryByTestId('sloHealthPanelViewAll')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SloHealthCell
// ---------------------------------------------------------------------------

describe('SloHealthCell', () => {
  beforeEach(() => {
    mockNavigateToApp.mockClear();
  });

  it('renders a "Suggest" link when total=0', () => {
    render(
      <SloHealthCell serviceName="foo" bucket={makeBucket()} isLoading={false} error={undefined} />
    );
    fireEvent.click(screen.getByTestId('sloHealthCellSuggest-foo'));
    expect(mockNavigateToApp).toHaveBeenLastCalledWith('observability-apm-slo', {
      path: '#/slos/suggest?source=apm&services=foo',
    });
  });

  it('renders worst-state chip and opens scoped listing on click', () => {
    const bucket = makeBucket({
      total: 3,
      ok: 1,
      breached: 1,
      warning: 1,
      hasAvailability: true,
      hasLatency: true,
      missingCanonicalPair: false,
    });
    render(
      <SloHealthCell
        serviceName="payments-api"
        bucket={bucket}
        isLoading={false}
        error={undefined}
      />
    );
    const link = screen.getByTestId('sloHealthCell-payments-api');
    expect(link).toHaveTextContent('1 breached');
    fireEvent.click(link);
    expect(mockNavigateToApp).toHaveBeenLastCalledWith('observability-apm-slo', {
      path: '#/slos?service=payments-api',
    });
  });

  it('appends the missing-pair warning icon only when total>0 and pair is incomplete', () => {
    const bucket = makeBucket({
      total: 1,
      ok: 1,
      hasAvailability: true,
      hasLatency: false,
      missingCanonicalPair: true,
    });
    render(<SloHealthCell serviceName="foo" bucket={bucket} isLoading={false} error={undefined} />);
    expect(screen.getByTestId('sloHealthMissingPairIcon-foo')).toBeInTheDocument();
  });

  it('does not render the missing-pair icon when pair is complete', () => {
    const bucket = makeBucket({
      total: 2,
      ok: 2,
      hasAvailability: true,
      hasLatency: true,
      missingCanonicalPair: false,
    });
    render(<SloHealthCell serviceName="foo" bucket={bucket} isLoading={false} error={undefined} />);
    expect(screen.queryByTestId('sloHealthMissingPairIcon-foo')).toBeNull();
  });

  it('renders the no-data chip when every SLO is no_data', () => {
    render(
      <SloHealthCell
        serviceName="foo"
        bucket={makeBucket({ total: 2, noData: 2, hasAvailability: true, hasLatency: true })}
        isLoading={false}
        error={undefined}
      />
    );
    expect(screen.getByTestId('sloHealthCell-foo')).toHaveTextContent('2 no data');
  });

  it('folds rulesMissing counts into the breached chip', () => {
    render(
      <SloHealthCell
        serviceName="foo"
        bucket={makeBucket({
          total: 1,
          rulesMissing: 1,
          hasAvailability: true,
          hasLatency: true,
        })}
        isLoading={false}
        error={undefined}
      />
    );
    expect(screen.getByTestId('sloHealthCell-foo')).toHaveTextContent('1 breached');
  });

  it('renders a skeleton on initial load', () => {
    render(<SloHealthCell serviceName="foo" bucket={undefined} isLoading error={undefined} />);
    expect(screen.getByTestId('sloHealthCellLoading-foo')).toBeInTheDocument();
  });

  it('renders a danger icon on generic error', () => {
    render(
      <SloHealthCell
        serviceName="foo"
        bucket={undefined}
        isLoading={false}
        error={{ kind: 'generic' }}
      />
    );
    expect(screen.getByTestId('sloHealthCellError-foo')).toBeInTheDocument();
  });

  it('renders a lock icon on forbidden error', () => {
    render(
      <SloHealthCell
        serviceName="foo"
        bucket={undefined}
        isLoading={false}
        error={{ kind: 'forbidden' }}
      />
    );
    expect(screen.getByTestId('sloHealthCellForbidden-foo')).toBeInTheDocument();
  });

  it('produces a descriptive aria-label when scoped', () => {
    const bucket = makeBucket({
      total: 2,
      breached: 1,
      ok: 1,
      hasAvailability: true,
      hasLatency: false,
      missingCanonicalPair: true,
    });
    render(
      <SloHealthCell
        serviceName="payments-api"
        bucket={bucket}
        isLoading={false}
        error={undefined}
      />
    );
    const link = screen.getByTestId('sloHealthCell-payments-api');
    expect(link.getAttribute('aria-label')).toMatch(/View SLOs for/);
    expect(link.getAttribute('aria-label')).toMatch(/1 breached/);
    expect(link.getAttribute('aria-label')).toMatch(/Missing latency SLO/);
  });
});
