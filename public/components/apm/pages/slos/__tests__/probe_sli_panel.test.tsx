/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProbeSliPanel } from '../probe_sli_panel';
import type { ProbeSliResponse } from '../../../../../../common/slo/slo_types';
import type { SloApiClient } from '../slo_api_client';

// MetricSparkline relies on canvas; stub it so the panel's render isn't gated
// on a chart implementation that doesn't exist in jsdom.
jest.mock('../../../shared/components/metric_sparkline', () => ({
  MetricSparkline: () => <div data-test-subj="stubbed-sparkline" />,
}));

function makeClient(probeSli: jest.Mock): Pick<SloApiClient, 'probeSli'> {
  return ({ probeSli } as unknown) as Pick<SloApiClient, 'probeSli'>;
}

describe('ProbeSliPanel', () => {
  it('renders the heading and the probe button', () => {
    render(
      <ProbeSliPanel
        apiClient={makeClient(jest.fn())}
        goodQuery="good"
        totalQuery="total"
        datasourceId="prom-1"
      />
    );
    expect(screen.getByTestId('slosWizardProbePanel')).toBeInTheDocument();
    expect(screen.getByTestId('slosWizardProbeButton')).toBeInTheDocument();
  });

  it('disables the probe button when any input is missing', () => {
    render(
      <ProbeSliPanel
        apiClient={makeClient(jest.fn())}
        goodQuery=""
        totalQuery="total"
        datasourceId="prom-1"
      />
    );
    expect(screen.getByTestId('slosWizardProbeButton')).toBeDisabled();
  });

  it('renders the result panel + ratio stat on success', async () => {
    const probe: ProbeSliResponse = {
      goodCount: 990,
      totalCount: 1000,
      sliRatio: 0.99,
      samplePoints: [],
    };
    const probeSli = jest.fn().mockResolvedValue(probe);

    render(
      <ProbeSliPanel
        apiClient={makeClient(probeSli)}
        goodQuery="good"
        totalQuery="total"
        datasourceId="prom-1"
      />
    );
    fireEvent.click(screen.getByTestId('slosWizardProbeButton'));

    await waitFor(() => {
      expect(screen.getByTestId('slosWizardProbeResult')).toBeInTheDocument();
    });
    expect(screen.getByTestId('slosWizardProbeRatioStat')).toBeInTheDocument();
    expect(probeSli).toHaveBeenCalledWith({
      datasourceId: 'prom-1',
      goodQuery: 'good',
      totalQuery: 'total',
      lookback: '1h',
    });
  });

  it('renders the request-error callout when probeSli rejects', async () => {
    const probeSli = jest.fn().mockRejectedValue(new Error('cortex 500'));
    render(
      <ProbeSliPanel
        apiClient={makeClient(probeSli)}
        goodQuery="g"
        totalQuery="t"
        datasourceId="prom-1"
      />
    );
    fireEvent.click(screen.getByTestId('slosWizardProbeButton'));

    expect(await screen.findByTestId('slosWizardProbeRequestError')).toBeInTheDocument();
    expect(screen.getByText('cortex 500')).toBeInTheDocument();
  });

  it('shows the empty-vector callout when the response has emptyVector=true', async () => {
    const probeSli = jest
      .fn()
      .mockResolvedValue({ goodCount: 0, totalCount: 100, emptyVector: true } as ProbeSliResponse);
    render(
      <ProbeSliPanel
        apiClient={makeClient(probeSli)}
        goodQuery="g"
        totalQuery="t"
        datasourceId="prom-1"
      />
    );
    fireEvent.click(screen.getByTestId('slosWizardProbeButton'));
    expect(await screen.findByTestId('slosWizardProbeEmptyVector')).toBeInTheDocument();
  });

  it('shows the per-query error callouts when errors.good or errors.total are set', async () => {
    const probeSli = jest.fn().mockResolvedValue({
      goodCount: 100,
      totalCount: 200,
      sliRatio: 0.5,
      errors: { good: 'parse error in goodQuery' },
    } as ProbeSliResponse);
    render(
      <ProbeSliPanel
        apiClient={makeClient(probeSli)}
        goodQuery="g"
        totalQuery="t"
        datasourceId="prom-1"
      />
    );
    fireEvent.click(screen.getByTestId('slosWizardProbeButton'));
    expect(await screen.findByTestId('slosWizardProbeErrorGood')).toBeInTheDocument();
    expect(screen.getByText('parse error in goodQuery')).toBeInTheDocument();
  });

  it('updates the lookback selector and passes the new value on probe', async () => {
    const probe: ProbeSliResponse = { goodCount: 1, totalCount: 1, sliRatio: 1 };
    const probeSli = jest.fn().mockResolvedValue(probe);
    render(
      <ProbeSliPanel
        apiClient={makeClient(probeSli)}
        goodQuery="g"
        totalQuery="t"
        datasourceId="prom-1"
      />
    );
    fireEvent.change(screen.getByTestId('slosWizardProbeLookback'), {
      target: { value: '7d' },
    });
    fireEvent.click(screen.getByTestId('slosWizardProbeButton'));
    await waitFor(() => {
      expect(probeSli).toHaveBeenCalledWith(expect.objectContaining({ lookback: '7d' }));
    });
  });

  it('renders nothing for the result panel in the idle state', () => {
    render(
      <ProbeSliPanel
        apiClient={makeClient(jest.fn())}
        goodQuery="g"
        totalQuery="t"
        datasourceId="prom-1"
      />
    );
    expect(screen.queryByTestId('slosWizardProbeResult')).not.toBeInTheDocument();
  });
});
