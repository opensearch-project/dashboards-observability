/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { SloOverviewPanel } from '../slo_overview_panel';
import type { SloHealthState, SloSummary } from '../../../../../../common/slo/slo_types';

function summary(
  overrides: Partial<SloSummary> & {
    state?: SloHealthState;
    remaining?: number;
    firing?: number;
    enabled?: boolean;
  } = {}
): SloSummary {
  return {
    id: overrides.id ?? 'slo-1',
    datasourceId: 'prom-1',
    datasourceType: 'prometheus',
    name: overrides.name ?? 'name',
    enabled: overrides.enabled ?? true,
    mode: 'active',
    service: 'svc',
    owner: { teams: ['t'] },
    sliNodeType: 'single',
    sliBackend: 'prometheus',
    sliLeafType: 'availability',
    objectiveCount: 1,
    worstTarget: 0.99,
    window: { type: 'rolling', duration: '28d' },
    labels: {},
    status: {
      sloId: overrides.id ?? 'slo-1',
      objectives: [
        {
          objectiveName: 'o',
          currentValue: 0.99,
          currentValueUnit: 'ratio',
          attainment: 0.99,
          errorBudgetRemaining: overrides.remaining ?? 0.5,
          state: overrides.state ?? 'ok',
        },
      ],
      state: overrides.state ?? 'ok',
      firingCount: overrides.firing ?? 0,
      ruleCount: 0,
      computedAt: '2026-04-01T00:00:00Z',
    },
    ...overrides,
  } as unknown as SloSummary;
}

describe('SloOverviewPanel', () => {
  it('renders nothing when items is empty', () => {
    const { container } = render(<SloOverviewPanel items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('rolls up state counts into KPI tiles', () => {
    render(
      <SloOverviewPanel
        items={[
          summary({ id: 'a', state: 'ok' }),
          summary({ id: 'b', state: 'breached', remaining: 0.05 }),
          summary({ id: 'c', state: 'warning', remaining: 0.2 }),
          summary({ id: 'd', state: 'no_data' }),
        ]}
      />
    );
    expect(screen.getByTestId('slosOverviewBreached')).toHaveTextContent('1');
    expect(screen.getByTestId('slosOverviewWarning')).toHaveTextContent('1');
    expect(screen.getByTestId('slosOverviewOk')).toHaveTextContent('1');
    expect(screen.getByTestId('slosOverviewNoData')).toHaveTextContent('1');
  });

  it('fires onStateFilterChange when a tile is clicked', () => {
    const onStateFilterChange = jest.fn();
    render(
      <SloOverviewPanel
        items={[summary({ state: 'breached' })]}
        onStateFilterChange={onStateFilterChange}
      />
    );
    fireEvent.click(screen.getByTestId('slosOverviewBreached'));
    expect(onStateFilterChange).toHaveBeenCalledWith('breached');
  });

  it('shows the "All reporting SLOs have >75%" fallback when no SLO is at risk', () => {
    render(
      <SloOverviewPanel
        items={[summary({ id: 'a', remaining: 0.9 }), summary({ id: 'b', remaining: 0.85 })]}
      />
    );
    expect(screen.getByTestId('slosOverviewAtRiskAllGreen')).toBeInTheDocument();
  });

  it('lists the worst SLOs in the at-risk leaderboard', () => {
    render(
      <SloOverviewPanel
        items={[
          summary({ id: 'a', remaining: 0.05, state: 'breached', name: 'slowSlo' }),
          summary({ id: 'b', remaining: 0.99, state: 'ok' }),
          summary({ id: 'c', remaining: 0.5, state: 'warning' }),
        ]}
      />
    );
    expect(screen.getByTestId('slosOverviewLeaderboardRow-reporting-a')).toBeInTheDocument();
  });

  it('renders the clear-filter button when activeStateFilter is set', () => {
    const onStateFilterChange = jest.fn();
    render(
      <SloOverviewPanel
        items={[summary({ state: 'breached' })]}
        activeStateFilter="breached"
        onStateFilterChange={onStateFilterChange}
      />
    );
    fireEvent.click(screen.getByTestId('slosOverviewClearFilter'));
    expect(onStateFilterChange).toHaveBeenCalledWith(null);
  });

  it('reports the firing count from individual summaries', () => {
    render(
      <SloOverviewPanel
        items={[summary({ firing: 2 }), summary({ id: 'b', firing: 3, state: 'breached' })]}
      />
    );
    expect(screen.getByTestId('slosOverviewFiring')).toHaveTextContent('5');
  });

  // M12 — a breached SLO with no firing alerts must not read as a "0 Firing"
  // contradiction. Firing counts alert instances (a different feed than the
  // breached SLO count), so the tile is relabelled "Alerts firing" and 0 is
  // truthful and unambiguous alongside a non-zero breached count.
  it('does not present a breached SLO with no firing alerts as a contradiction (M12)', () => {
    render(
      <SloOverviewPanel items={[summary({ state: 'breached', remaining: -0.5, firing: 0 })]} />
    );
    const firing = screen.getByTestId('slosOverviewFiring');
    expect(firing).toHaveTextContent('0');
    expect(firing).toHaveTextContent('Alerts firing');
    expect(screen.getByTestId('slosOverviewBreached')).toHaveTextContent('1');
  });

  it('ignores a non-finite firingCount so one bad row cannot NaN the tile (M12)', () => {
    render(
      <SloOverviewPanel
        items={[
          summary({ id: 'a', firing: NaN as unknown as number }),
          summary({ id: 'b', firing: 2 }),
        ]}
      />
    );
    expect(screen.getByTestId('slosOverviewFiring')).toHaveTextContent('2');
  });

  it('clamps the aggregate-budget hero at 0% when budgets are overspent (CLAR8)', () => {
    render(<SloOverviewPanel items={[summary({ state: 'breached', remaining: -2 })]} />);
    const budget = screen.getByTestId('slosOverviewBudget');
    // Never shows a nonsensical negative percentage like -200%.
    expect(budget.textContent).not.toContain('-');
    expect(budget).toHaveTextContent('0');
  });

  it('marks the active KPI tile with aria-pressed and non-clickable tiles with none (A11Y2)', () => {
    render(
      <SloOverviewPanel
        items={[summary({ state: 'breached' })]}
        activeStateFilter="breached"
        onStateFilterChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('slosOverviewBreached')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('slosOverviewOk')).toHaveAttribute('aria-pressed', 'false');
    // The aggregate-budget tile is not a filter toggle — it exposes no pressed state.
    expect(screen.getByTestId('slosOverviewBudget')).not.toHaveAttribute('aria-pressed');
  });

  it('activates on Space and calls preventDefault so the page does not scroll (A11Y5)', () => {
    const onStateFilterChange = jest.fn();
    render(
      <SloOverviewPanel
        items={[summary({ state: 'breached' })]}
        onStateFilterChange={onStateFilterChange}
      />
    );
    const tile = screen.getByTestId('slosOverviewBreached');
    const spaceEvent = createEvent.keyDown(tile, { key: ' ' });
    fireEvent(tile, spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(onStateFilterChange).toHaveBeenCalledWith('breached');
  });

  it('activates once on Enter without double-firing (A11Y5)', () => {
    const onStateFilterChange = jest.fn();
    render(
      <SloOverviewPanel
        items={[summary({ state: 'breached' })]}
        onStateFilterChange={onStateFilterChange}
      />
    );
    const tile = screen.getByTestId('slosOverviewBreached');
    const enterEvent = createEvent.keyDown(tile, { key: 'Enter' });
    fireEvent(tile, enterEvent);
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(onStateFilterChange).toHaveBeenCalledTimes(1);
    expect(onStateFilterChange).toHaveBeenCalledWith('breached');
  });
});
