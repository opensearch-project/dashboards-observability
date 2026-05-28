/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ServiceRowShape, ServiceTreeTable } from '../suggest_service_tree_table';
import type { Suggestion } from '../suggest_engine';

function fakeSuggestion(key: string, kind = 'HTTP availability'): Suggestion {
  return ({
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
  } as unknown) as Suggestion;
}

function row(overrides: Partial<ServiceRowShape> = {}): ServiceRowShape {
  return {
    serviceName: overrides.serviceName ?? 'cart',
    drafts: overrides.drafts ?? [fakeSuggestion('a'), fakeSuggestion('b')],
    selectedCount: overrides.selectedCount ?? 1,
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
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders the selection badge with the correct counts', () => {
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
    const badge = screen.getByTestId('slosSuggestSelectionBadge-cart');
    expect(badge).toHaveTextContent('1 / 2 selected');
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
});
