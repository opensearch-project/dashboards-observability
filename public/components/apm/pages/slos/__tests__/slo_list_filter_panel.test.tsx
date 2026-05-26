/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SloListFilterPanel } from '../slo_list_filter_panel';
import type { SloSummary } from '../../../../../../common/slo/slo_types';

function makeSummary(overrides: Partial<SloSummary> = {}): SloSummary {
  return {
    id: 'slo-1',
    datasourceId: 'ds-1',
    datasourceType: 'prometheus',
    name: 'api-availability',
    enabled: true,
    mode: 'active',
    service: 'payments-api',
    owner: { teams: ['sre'] },
    tier: 'tier-1',
    sliNodeType: 'single',
    sliBackend: 'prometheus',
    sliLeafType: 'availability',
    objectiveCount: 1,
    worstTarget: 0.999,
    window: { type: 'rolling', duration: '28d' },
    labels: {},
    status: {
      sloId: 'slo-1',
      objectives: [],
      state: 'ok',
      firingCount: 0,
      ruleCount: 0,
      computedAt: new Date(0).toISOString(),
    },
    ...overrides,
  };
}

describe('SloListFilterPanel (sidebar)', () => {
  it('renders an accordion per facet', () => {
    render(<SloListFilterPanel filters={{}} onChange={jest.fn()} items={[makeSummary()]} />);
    expect(screen.getByTestId('slosFilterAccordionState')).toBeInTheDocument();
    expect(screen.getByTestId('slosFilterAccordionSliType')).toBeInTheDocument();
    expect(screen.getByTestId('slosFilterAccordionCanonicalKind')).toBeInTheDocument();
    expect(screen.getByTestId('slosFilterAccordionService')).toBeInTheDocument();
    expect(screen.getByTestId('slosFilterAccordionTeam')).toBeInTheDocument();
    expect(screen.getByTestId('slosFilterAccordionTier')).toBeInTheDocument();
    expect(screen.getByTestId('slosFilterAccordionMode')).toBeInTheDocument();
    expect(screen.getByTestId('slosFilterAccordionEnabled')).toBeInTheDocument();
  });

  it('renders human-readable canonical kind labels from KIND_LABEL', () => {
    render(<SloListFilterPanel filters={{}} onChange={jest.fn()} items={[makeSummary()]} />);
    expect(screen.getByLabelText('APM availability')).toBeInTheDocument();
    expect(screen.getByLabelText('HTTP latency')).toBeInTheDocument();
    expect(screen.getByLabelText('GenAI availability')).toBeInTheDocument();
  });

  it('toggles canonical kind when its checkbox is clicked', () => {
    const onChange = jest.fn();
    render(<SloListFilterPanel filters={{}} onChange={onChange} items={[makeSummary()]} />);
    fireEvent.click(screen.getByLabelText('APM availability'));
    expect(onChange).toHaveBeenCalledWith({ canonicalKind: ['apm-availability'] });
  });

  it('clears canonicalKind when the last selected checkbox is unticked', () => {
    const onChange = jest.fn();
    render(
      <SloListFilterPanel
        filters={{ canonicalKind: ['apm-availability'] }}
        onChange={onChange}
        items={[makeSummary()]}
      />
    );
    fireEvent.click(screen.getByLabelText('APM availability'));
    expect(onChange).toHaveBeenCalledWith({ canonicalKind: undefined });
  });

  it('toggles a state value when its checkbox is clicked', () => {
    const onChange = jest.fn();
    render(<SloListFilterPanel filters={{}} onChange={onChange} items={[makeSummary()]} />);
    // The checkbox group renders one input per option; click "breached".
    fireEvent.click(screen.getByLabelText('Breached'));
    expect(onChange).toHaveBeenCalledWith({ state: ['breached'] });
  });

  it('removes a state value when its checkbox is clicked again', () => {
    const onChange = jest.fn();
    render(
      <SloListFilterPanel
        filters={{ state: ['breached'] }}
        onChange={onChange}
        items={[makeSummary()]}
      />
    );
    fireEvent.click(screen.getByLabelText('Breached'));
    expect(onChange).toHaveBeenCalledWith({ state: undefined });
  });

  it('tri-state enabled group switches to yes / no / any via the button group', () => {
    const onChange = jest.fn();
    render(<SloListFilterPanel filters={{}} onChange={onChange} items={[makeSummary()]} />);
    // EuiButtonGroup wraps radios; each input carries `data-test-subj` equal to
    // its option id ("any" | "yes" | "no").
    fireEvent.click(screen.getByTestId('yes'));
    expect(onChange).toHaveBeenLastCalledWith({ enabled: true });
  });

  it('only shows services derived from the items list', () => {
    render(
      <SloListFilterPanel
        filters={{}}
        onChange={jest.fn()}
        items={[
          makeSummary({ service: 'payments-api' }),
          makeSummary({ id: 's2', service: 'cart-service' }),
        ]}
      />
    );
    expect(screen.getByLabelText('payments-api')).toBeInTheDocument();
    expect(screen.getByLabelText('cart-service')).toBeInTheDocument();
  });
});
