/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ServiceRowShape, ServiceTreeTable } from '../suggest_service_tree_table';
import type { Suggestion } from '../suggest_engine';

function fakeSuggestion(key: string, kind = 'HTTP availability'): Suggestion {
  return {
    key,
    kindId: 'http-availability',
    kind,
    reason: '',
    sourceMetric: 'm',
    detected: {},
    estimatedRuleCount: 13,
    input: {
      spec: {
        datasourceId: 'ds-1',
        name: key,
        enabled: true,
        mode: 'active',
        service: 'cart',
        owner: { teams: ['t'] },
        sli: {
          type: 'single',
          definition: {
            backend: 'prometheus',
            type: 'availability',
            calcMethod: 'events',
            metric: 'm',
          },
          dimensions: [],
        },
        objectives: [{ name: 'o', target: 0.99 }],
        budgetWarningThresholds: [],
        window: { type: 'rolling', duration: '28d' },
        alerting: { strategy: 'mwmbr', burnRates: [] },
        alarms: {
          sliHealth: { enabled: false },
          attainmentBreach: { enabled: false },
          budgetWarning: { enabled: true },
          noData: { enabled: false, forDuration: '10m' },
          resolved: { enabled: false },
        },
        exclusionWindows: [],
        labels: {},
        annotations: {},
      },
    },
  } as unknown as Suggestion;
}

function row(overrides: Partial<ServiceRowShape> = {}): ServiceRowShape {
  const drafts = overrides.drafts ?? [fakeSuggestion('a'), fakeSuggestion('b')];
  return {
    serviceName: overrides.serviceName ?? 'cart',
    drafts,
    selectedCount: overrides.selectedCount ?? 1,
    // Default every draft to selectable (nothing covered) unless overridden.
    selectableCount: overrides.selectableCount ?? drafts.length,
    totalRules: overrides.totalRules ?? 26,
    coveredCount: overrides.coveredCount ?? 0,
    kinds: overrides.kinds ?? ['HTTP availability', 'HTTP latency'],
    environment: overrides.environment,
  };
}

describe('ServiceTreeTable', () => {
  it('renders one row per service', () => {
    render(
      <ServiceTreeTable
        serviceRows={[row({ serviceName: 'cart' }), row({ serviceName: 'checkout' })]}
        expandedMap={{}}
        onToggleExpand={jest.fn()}
        onToggleServiceSelection={jest.fn()}
        selected={new Set()}
        overrides={{}}
        onToggleDraft={jest.fn()}
        onOverrideChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('slosSuggestServiceRow-cart')).toBeInTheDocument();
    expect(screen.getByTestId('slosSuggestServiceRow-checkout')).toBeInTheDocument();
  });

  it('renders the inline rows for an expanded service and not for a collapsed one', () => {
    render(
      <ServiceTreeTable
        serviceRows={[row({ serviceName: 'cart' }), row({ serviceName: 'checkout' })]}
        expandedMap={{ cart: true, checkout: false }}
        onToggleExpand={jest.fn()}
        onToggleServiceSelection={jest.fn()}
        selected={new Set(['a'])}
        overrides={{}}
        onToggleDraft={jest.fn()}
        onOverrideChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('slosSuggestServiceExpanded-cart')).toBeInTheDocument();
    expect(screen.queryByTestId('slosSuggestServiceExpanded-checkout')).not.toBeInTheDocument();
  });

  it('fires onToggleExpand on the expand button', () => {
    const onToggleExpand = jest.fn();
    render(
      <ServiceTreeTable
        serviceRows={[row()]}
        expandedMap={{ cart: false }}
        onToggleExpand={onToggleExpand}
        onToggleServiceSelection={jest.fn()}
        selected={new Set()}
        overrides={{}}
        onToggleDraft={jest.fn()}
        onOverrideChange={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('slosSuggestServiceExpand-cart'));
    expect(onToggleExpand).toHaveBeenCalledWith('cart');
  });

  it('fires onToggleServiceSelection when the service-level checkbox is clicked', () => {
    const onToggleServiceSelection = jest.fn();
    const r = row();
    render(
      <ServiceTreeTable
        serviceRows={[r]}
        expandedMap={{ cart: false }}
        onToggleExpand={jest.fn()}
        onToggleServiceSelection={onToggleServiceSelection}
        selected={new Set()}
        overrides={{}}
        onToggleDraft={jest.fn()}
        onOverrideChange={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('slosSuggestServiceSelect-cart'));
    expect(onToggleServiceSelection).toHaveBeenCalledWith(r);
  });

  it('renders the coveredCount when > 0', () => {
    render(
      <ServiceTreeTable
        serviceRows={[row({ coveredCount: 3 })]}
        expandedMap={{}}
        onToggleExpand={jest.fn()}
        onToggleServiceSelection={jest.fn()}
        selected={new Set()}
        overrides={{}}
        onToggleDraft={jest.fn()}
        onOverrideChange={jest.fn()}
      />
    );
    expect(screen.getByText('3 covered')).toBeInTheDocument();
  });

  it('disables the master checkbox when the service has no selectable drafts', () => {
    render(
      <ServiceTreeTable
        serviceRows={[row({ selectableCount: 0, selectedCount: 0, coveredCount: 2 })]}
        expandedMap={{}}
        onToggleExpand={jest.fn()}
        onToggleServiceSelection={jest.fn()}
        selected={new Set()}
        overrides={{}}
        onToggleDraft={jest.fn()}
        onOverrideChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('slosSuggestServiceSelect-cart')).toBeDisabled();
  });

  it('disables the inline checkbox for drafts named in coveredKeys', () => {
    render(
      <ServiceTreeTable
        serviceRows={[row({ selectableCount: 1 })]}
        expandedMap={{ cart: true }}
        onToggleExpand={jest.fn()}
        onToggleServiceSelection={jest.fn()}
        selected={new Set()}
        overrides={{}}
        onToggleDraft={jest.fn()}
        onOverrideChange={jest.fn()}
        coveredKeys={new Set(['a'])}
      />
    );
    // Draft 'a' is covered → its checkbox is disabled; 'b' stays enabled.
    expect(screen.getByTestId('slosSuggestSelect-a')).toBeDisabled();
    expect(screen.getByTestId('slosSuggestSelect-b')).not.toBeDisabled();
  });

  it('renders the selection count with the correct values', () => {
    render(
      <ServiceTreeTable
        serviceRows={[row({ selectedCount: 1 })]}
        expandedMap={{}}
        onToggleExpand={jest.fn()}
        onToggleServiceSelection={jest.fn()}
        selected={new Set()}
        overrides={{}}
        onToggleDraft={jest.fn()}
        onOverrideChange={jest.fn()}
      />
    );
    expect(screen.getByText('1/2 SLOs selected')).toBeInTheDocument();
  });

  it('caps SLI mix badges and renders an overflow badge', () => {
    const drafts = [
      fakeSuggestion('a', 'HTTP availability'),
      fakeSuggestion('b', 'HTTP latency'),
      fakeSuggestion('c', 'RPC availability'),
      fakeSuggestion('d', 'RPC latency'),
      fakeSuggestion('e', 'DB latency'),
      fakeSuggestion('f', 'GenAI availability'),
    ];
    render(
      <ServiceTreeTable
        serviceRows={[
          row({
            drafts,
            kinds: drafts.map((d) => d.kind),
          }),
        ]}
        expandedMap={{}}
        onToggleExpand={jest.fn()}
        onToggleServiceSelection={jest.fn()}
        selected={new Set()}
        overrides={{}}
        onToggleDraft={jest.fn()}
        onOverrideChange={jest.fn()}
      />
    );
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('clears the SLI-mix popover close timer on unmount without a setState warning', () => {
    jest.useFakeTimers();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { unmount } = render(
        <ServiceTreeTable
          serviceRows={[row()]}
          expandedMap={{}}
          onToggleExpand={jest.fn()}
          onToggleServiceSelection={jest.fn()}
          selected={new Set()}
          overrides={{}}
          onToggleDraft={jest.fn()}
          onOverrideChange={jest.fn()}
        />
      );
      // Open a badge popover (hover), then leave to arm the 150ms close timer.
      const badge = screen.getAllByText('HTTP availability')[0];
      fireEvent.mouseEnter(badge);
      fireEvent.mouseLeave(badge);
      // Unmount with the timer still pending, then let it fire.
      unmount();
      act(() => {
        jest.runAllTimers();
      });
      expect(errSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('not wrapped in act'),
        expect.anything(),
        expect.anything()
      );
      expect(errSpy).not.toHaveBeenCalledWith(expect.stringContaining('unmounted component'));
    } finally {
      errSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('opens the SLI-mix popover on hover and holds it open through the grace delay', () => {
    jest.useFakeTimers();
    try {
      render(
        <ServiceTreeTable
          serviceRows={[row({ drafts: [fakeSuggestion('a', 'HTTP availability')] })]}
          expandedMap={{}}
          onToggleExpand={jest.fn()}
          onToggleServiceSelection={jest.fn()}
          selected={new Set()}
          overrides={{}}
          onToggleDraft={jest.fn()}
          onOverrideChange={jest.fn()}
        />
      );
      const badge = screen.getByText('HTTP availability');

      // Not open until hovered.
      expect(screen.queryByText('Metric:')).not.toBeInTheDocument();

      // Hover opens the popover — its draft detail (the "Metric:" line) appears.
      act(() => {
        fireEvent.mouseEnter(badge);
      });
      expect(screen.getByText('Metric:')).toBeInTheDocument();

      // Leaving arms the close timer; the grace delay keeps it open just before
      // the delay elapses so moving the pointer into the panel doesn't dismiss
      // it. (The close firing + timer cleanup is covered by the unmount test.)
      act(() => {
        fireEvent.mouseLeave(badge);
        jest.advanceTimersByTime(HOVER_CLOSE_DELAY_MS - 1);
      });
      expect(screen.getByText('Metric:')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});

const HOVER_CLOSE_DELAY_MS = 150;
