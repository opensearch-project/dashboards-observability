/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';

const mockExecuteInstantQuery = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeInstantQuery: mockExecuteInstantQuery,
  })),
}));

import { SuggestBatchPreview } from '../suggest_batch_preview';
import type { Suggestion } from '../suggest_engine';
import type { SloApiClient } from '../slo_api_client';
import type { GeneratedRuleGroup } from '../../../../../../common/slo/slo_types';

function fakeSuggestion(key: string, service = 'cart'): Suggestion {
  return {
    key,
    kindId: 'http-availability',
    kind: 'HTTP availability',
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
        service,
        owner: { teams: ['t'] },
        sli: {
          type: 'single',
          definition: {
            backend: 'prometheus',
            type: 'availability',
            calcMethod: 'events',
            metric: 'm',
          },
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
  } as unknown as Suggestion;
}

const fakeGroup: GeneratedRuleGroup = {
  groupName: 'g',
  interval: 30,
  rules: [
    {
      type: 'recording',
      name: 'r1',
      expr: 'expr',
      labels: {},
      description: '',
    },
  ],
  yaml: 'yaml content',
};

describe('SuggestBatchPreview', () => {
  beforeEach(() => {
    mockExecuteInstantQuery.mockReset();
  });

  it('renders an empty-state message when no suggestions are selected', () => {
    const apiClient = { preview: jest.fn() } as unknown as Pick<SloApiClient, 'preview'>;
    render(<SuggestBatchPreview apiClient={apiClient} selectedSuggestions={[]} />);
    expect(screen.getByText('Select at least one draft to preview.')).toBeInTheDocument();
  });

  it('renders a SuggestPreviewRow per suggestion after preview resolves', async () => {
    const preview = jest.fn().mockResolvedValue(fakeGroup);
    const apiClient = { preview } as unknown as Pick<SloApiClient, 'preview'>;

    render(
      <SuggestBatchPreview
        apiClient={apiClient}
        selectedSuggestions={[fakeSuggestion('a'), fakeSuggestion('b')]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('slosSuggestPreviewRow-a')).toBeInTheDocument();
      expect(screen.getByTestId('slosSuggestPreviewRow-b')).toBeInTheDocument();
    });
    expect(preview).toHaveBeenCalledTimes(2);
  });

  it('exposes the SLI evaluation window selector', async () => {
    const apiClient = { preview: jest.fn().mockResolvedValue(fakeGroup) } as unknown as Pick<
      SloApiClient,
      'preview'
    >;
    render(
      <SuggestBatchPreview apiClient={apiClient} selectedSuggestions={[fakeSuggestion('a')]} />
    );
    expect(screen.getByTestId('slosSuggestPreviewWindow')).toBeInTheDocument();
    await waitFor(() => {
      // Drain the in-flight preview effect so its setState lands inside the
      // act-managed test scope and we don't leak warnings into siblings.
      expect(screen.getByTestId('slosSuggestPreviewRow-a')).toBeInTheDocument();
    });
  });

  it('shows aggregate rule count after every preview resolves', async () => {
    const preview = jest.fn().mockResolvedValue(fakeGroup);
    const apiClient = { preview } as unknown as Pick<SloApiClient, 'preview'>;
    render(
      <SuggestBatchPreview
        apiClient={apiClient}
        selectedSuggestions={[fakeSuggestion('a'), fakeSuggestion('b')]}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/2 rules total/)).toBeInTheDocument();
    });
  });

  it('renders one accordion group per service even when drafts are non-contiguous', async () => {
    const preview = jest.fn().mockResolvedValue(fakeGroup);
    const apiClient = { preview } as unknown as Pick<SloApiClient, 'preview'>;
    // Interleave services (cart, checkout, cart) — mirrors the engine emitting
    // detector-first, so a service's drafts aren't adjacent in the list. The
    // grouping must still coalesce them into a single per-service accordion.
    render(
      <SuggestBatchPreview
        apiClient={apiClient}
        selectedSuggestions={[
          fakeSuggestion('cart-avail', 'cart'),
          fakeSuggestion('checkout-avail', 'checkout'),
          fakeSuggestion('cart-http', 'cart'),
        ]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('slosSuggestPreviewRow-cart-http')).toBeInTheDocument();
    });
    // Exactly one group per distinct service — no duplicate 'cart' group.
    expect(screen.getAllByTestId('slosSuggestPreviewGroup-cart')).toHaveLength(1);
    expect(screen.getAllByTestId('slosSuggestPreviewGroup-checkout')).toHaveLength(1);
    // Both of cart's non-contiguous drafts land in the single cart group.
    const cartGroup = screen.getByTestId('slosSuggestPreviewGroup-cart');
    expect(within(cartGroup).getByTestId('slosSuggestPreviewRow-cart-avail')).toBeInTheDocument();
    expect(within(cartGroup).getByTestId('slosSuggestPreviewRow-cart-http')).toBeInTheDocument();
  });

  /** Data-frame scalar as the PromQL search service returns it. */
  function valueFrame(n: number) {
    return { fields: [{ name: 'Value', values: [n] }] };
  }

  it('shows the breaching badge when the live SLI is below target', async () => {
    const preview = jest.fn().mockResolvedValue(fakeGroup);
    const apiClient = { preview } as unknown as Pick<SloApiClient, 'preview'>;
    // Availability draft (target 0.99): ratio query → 0.5 (below target),
    // samples query → 100 (>0 so the comparison runs), p99 unused.
    mockExecuteInstantQuery.mockImplementation(({ query }: { query: string }) => {
      if (query.includes('http_response_status_code')) return Promise.resolve(valueFrame(0.5));
      if (query.includes('increase(')) return Promise.resolve(valueFrame(100));
      return Promise.resolve(valueFrame(NaN));
    });

    render(
      <SuggestBatchPreview
        apiClient={apiClient}
        selectedSuggestions={[fakeSuggestion('a')]}
        prometheusConnectionId="prom-1"
      />
    );

    await waitFor(() => expect(screen.getByText('1 breaching')).toBeInTheDocument());
  });

  it('shows the failed badge when a preview request rejects', async () => {
    const preview = jest.fn().mockRejectedValue(new Error('preview boom'));
    const apiClient = { preview } as unknown as Pick<SloApiClient, 'preview'>;

    render(
      <SuggestBatchPreview apiClient={apiClient} selectedSuggestions={[fakeSuggestion('a')]} />
    );

    await waitFor(() => expect(screen.getByText('1 failed')).toBeInTheDocument());
  });
});
