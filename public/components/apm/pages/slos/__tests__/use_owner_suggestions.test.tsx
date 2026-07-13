/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useOwnerSuggestions } from '../use_owner_suggestions';
import type { SloApiClient } from '../slo_api_client';

type ProbeApiClient = Pick<SloApiClient, 'labelValues' | 'list'>;

function Probe({ apiClient, datasourceId }: { apiClient: ProbeApiClient; datasourceId: string }) {
  const { services, teams } = useOwnerSuggestions(apiClient, datasourceId);
  return (
    <div>
      <span data-test-subj="services">{services.join(',')}</span>
      <span data-test-subj="teams">{teams.join(',')}</span>
    </div>
  );
}

describe('useOwnerSuggestions', () => {
  it('derives team suggestions from existing SLOs (deduped, sorted)', async () => {
    const apiClient = {
      list: jest.fn().mockResolvedValue({
        results: [
          { owner: { teams: ['sre', 'platform'] } },
          { owner: { teams: ['platform'] } },
          { owner: { teams: [] } },
        ],
      }),
      labelValues: jest.fn().mockResolvedValue({ values: [] }),
    };
    render(<Probe apiClient={apiClient} datasourceId="" />);
    await waitFor(() => expect(screen.getByTestId('teams')).toHaveTextContent('platform,sre'));
  });

  it('does not query label values until a datasource is selected', async () => {
    const apiClient = {
      list: jest.fn().mockResolvedValue({ results: [] }),
      labelValues: jest.fn().mockResolvedValue({ values: [] }),
    };
    render(<Probe apiClient={apiClient} datasourceId="" />);
    await waitFor(() => expect(apiClient.list).toHaveBeenCalled());
    expect(apiClient.labelValues).not.toHaveBeenCalled();
  });

  it('merges service label values across service labels when a datasource is set', async () => {
    const apiClient = {
      list: jest.fn().mockResolvedValue({ results: [] }),
      labelValues: jest
        .fn()
        .mockImplementation((_ds: string, label: string) =>
          label === 'service_name'
            ? Promise.resolve({ values: ['checkout', 'payments'] })
            : Promise.resolve({ values: ['grpc-svc'] })
        ),
    };
    render(<Probe apiClient={apiClient} datasourceId="ds-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('services')).toHaveTextContent('checkout,grpc-svc,payments')
    );
    expect(apiClient.labelValues).toHaveBeenCalledWith('ds-1', 'service_name');
    expect(apiClient.labelValues).toHaveBeenCalledWith('ds-1', 'rpc_service');
  });

  it('degrades to empty suggestions when the API rejects (never blocks the field)', async () => {
    const apiClient = {
      list: jest.fn().mockRejectedValue(new Error('boom')),
      labelValues: jest.fn().mockRejectedValue(new Error('boom')),
    };
    render(<Probe apiClient={apiClient} datasourceId="ds-1" />);
    await waitFor(() => expect(apiClient.labelValues).toHaveBeenCalled());
    expect(screen.getByTestId('teams')).toHaveTextContent('');
    expect(screen.getByTestId('services')).toHaveTextContent('');
  });
});
