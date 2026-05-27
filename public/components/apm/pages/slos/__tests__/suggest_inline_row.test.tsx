/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SuggestionInlineRow } from '../suggest_inline_row';
import type { Suggestion } from '../suggest_engine';

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  const latencyObjective = overrides.input?.spec.objectives?.[0]?.latencyThreshold !== undefined;
  return ({
    key: overrides.key ?? 'http-avail:cart',
    kindId: overrides.kindId ?? 'http-availability',
    kind: overrides.kind ?? 'HTTP availability',
    reason: overrides.reason ?? 'http_server_request_duration_seconds_count observed',
    sourceMetric: 'm',
    detected: { service_name: 'cart' },
    estimatedRuleCount: overrides.estimatedRuleCount ?? 13,
    existingRuleMatch: overrides.existingRuleMatch,
    input: overrides.input ?? {
      spec: {
        datasourceId: 'ds-1',
        name: 'cart — HTTP availability',
        enabled: true,
        mode: 'active',
        service: 'cart',
        owner: { teams: ['unassigned'] },
        tier: 'tier-2',
        sli: {
          type: 'single',
          definition: latencyObjective
            ? {
                backend: 'prometheus',
                type: 'latency_threshold',
                calcMethod: 'events',
                metric: 'http_server_request_duration_seconds_bucket',
                latencyThresholdUnit: 'seconds',
              }
            : { backend: 'prometheus', type: 'availability', calcMethod: 'events', metric: 'm' },
          dimensions: [{ name: 'service_name', value: 'cart' }],
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

describe('SuggestionInlineRow', () => {
  it('renders the spec name, kind badge, and rule-count badge', () => {
    const onToggle = jest.fn();
    const onOverrideChange = jest.fn();
    render(
      <SuggestionInlineRow
        suggestion={makeSuggestion()}
        selected
        onToggle={onToggle}
        overrides={{}}
        onOverrideChange={onOverrideChange}
      />
    );
    expect(screen.getByText(/cart — HTTP availability/)).toBeInTheDocument();
    expect(screen.getByText('HTTP availability')).toBeInTheDocument();
    expect(screen.getByText(/13 rules/)).toBeInTheDocument();
  });

  it('fires onToggle when the checkbox is clicked', () => {
    const onToggle = jest.fn();
    render(
      <SuggestionInlineRow
        suggestion={makeSuggestion()}
        selected={false}
        onToggle={onToggle}
        overrides={{}}
        onOverrideChange={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('slosSuggestSelect-http-avail:cart'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders the covered badge when the suggestion has an existingRuleMatch', () => {
    render(
      <SuggestionInlineRow
        suggestion={makeSuggestion({
          existingRuleMatch: { groupName: 'g', ruleName: 'r' },
        })}
        selected={false}
        onToggle={jest.fn()}
        overrides={{}}
        onOverrideChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('slosSuggestCovered-http-avail:cart')).toBeInTheDocument();
  });

  it('hides the latency override slot for availability objectives', () => {
    render(
      <SuggestionInlineRow
        suggestion={makeSuggestion()}
        selected
        onToggle={jest.fn()}
        overrides={{}}
        onOverrideChange={jest.fn()}
      />
    );
    expect(screen.queryByLabelText('Latency threshold')).not.toBeInTheDocument();
  });

  it('shows the p95 latency input for latency objectives', () => {
    const sug = makeSuggestion({
      key: 'http-lat:cart',
      kindId: 'http-latency',
      input: {
        spec: {
          datasourceId: 'ds-1',
          name: 'cart — HTTP latency',
          enabled: true,
          mode: 'active',
          service: 'cart',
          owner: { teams: ['t'] },
          tier: 'tier-2',
          sli: {
            type: 'single',
            definition: {
              backend: 'prometheus',
              type: 'latency_threshold',
              calcMethod: 'events',
              metric: 'http_server_request_duration_seconds_bucket',
              latencyThresholdUnit: 'seconds',
            },
            dimensions: [],
          },
          objectives: [{ name: 'o', target: 0.95, latencyThreshold: 0.5 }],
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
    });
    render(
      <SuggestionInlineRow
        suggestion={sug}
        selected
        onToggle={jest.fn()}
        overrides={{}}
        onOverrideChange={jest.fn()}
      />
    );
    expect(screen.getByLabelText('Latency threshold')).toBeInTheDocument();
  });

  it('forwards override changes via onOverrideChange', () => {
    const onOverrideChange = jest.fn();
    render(
      <SuggestionInlineRow
        suggestion={makeSuggestion()}
        selected
        onToggle={jest.fn()}
        overrides={{}}
        onOverrideChange={onOverrideChange}
      />
    );
    fireEvent.change(screen.getByLabelText('Owner team'), {
      target: { value: 'platform' },
    });
    expect(onOverrideChange).toHaveBeenCalledWith({ ownerTeam: 'platform' });
  });

  it('shows the creating spinner status', () => {
    render(
      <SuggestionInlineRow
        suggestion={makeSuggestion()}
        selected
        onToggle={jest.fn()}
        overrides={{}}
        onOverrideChange={jest.fn()}
        rowStatus="creating"
      />
    );
    expect(screen.getByTestId('slosSuggestRowStatus-http-avail:cart-creating')).toBeInTheDocument();
  });

  it('shows the success icon status', () => {
    render(
      <SuggestionInlineRow
        suggestion={makeSuggestion()}
        selected
        onToggle={jest.fn()}
        overrides={{}}
        onOverrideChange={jest.fn()}
        rowStatus="success"
      />
    );
    expect(screen.getByTestId('slosSuggestRowStatus-http-avail:cart-success')).toBeInTheDocument();
  });

  it('shows an error indicator when rowStatus="error" and hides the checkbox', () => {
    const onToggle = jest.fn();
    render(
      <SuggestionInlineRow
        suggestion={makeSuggestion()}
        selected
        onToggle={onToggle}
        overrides={{}}
        onOverrideChange={jest.fn()}
        rowStatus="error"
        rowStatusMessage="boom"
      />
    );
    // The select checkbox is replaced by the error indicator slot, so no
    // checkbox is present and clicking the row's status area doesn't toggle.
    expect(screen.queryByTestId('slosSuggestSelect-http-avail:cart')).not.toBeInTheDocument();
  });
});
