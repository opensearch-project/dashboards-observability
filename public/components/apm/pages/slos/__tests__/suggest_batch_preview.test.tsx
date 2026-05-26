/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

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

function fakeSuggestion(key: string): Suggestion {
  return ({
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
    const apiClient = ({ preview: jest.fn() } as unknown) as Pick<SloApiClient, 'preview'>;
    render(<SuggestBatchPreview apiClient={apiClient} selectedSuggestions={[]} />);
    expect(screen.getByText('Select at least one draft to preview.')).toBeInTheDocument();
  });

  it('renders a SuggestPreviewRow per suggestion after preview resolves', async () => {
    const preview = jest.fn().mockResolvedValue(fakeGroup);
    const apiClient = ({ preview } as unknown) as Pick<SloApiClient, 'preview'>;

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
    const apiClient = ({ preview: jest.fn().mockResolvedValue(fakeGroup) } as unknown) as Pick<
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
    const apiClient = ({ preview } as unknown) as Pick<SloApiClient, 'preview'>;
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
});
