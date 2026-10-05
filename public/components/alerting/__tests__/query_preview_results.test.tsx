/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for QueryPreviewResults — specifically that a not-run / no-input state
 * is distinguished from a genuine empty result, so the "returned no data"
 * warning never blames a valid metric for missing input (review finding p2).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryPreviewResults } from '../query_preview_results';

jest.mock('../echarts_render', () => ({
  EchartsRender: () => <div data-test-subj="echarts-render" />,
}));

const mockRunQueryPreview = jest.fn();
jest.mock('../query_services/alerting_prom_resources_service', () => ({
  AlertingPromResourcesService: jest
    .fn()
    .mockImplementation(() => ({ runQueryPreview: mockRunQueryPreview })),
}));

describe('QueryPreviewResults — not-run vs. empty result', () => {
  beforeEach(() => mockRunQueryPreview.mockReset());

  it('shows a neutral prompt (not the empty-result warning) when there is no expression', () => {
    render(<QueryPreviewResults query="" datasourceId="ds-1" />);
    expect(screen.getByText('Nothing to preview yet')).toBeInTheDocument();
    expect(screen.queryByText('No results for this time range')).not.toBeInTheDocument();
    expect(mockRunQueryPreview).not.toHaveBeenCalled();
  });

  it('shows a neutral prompt when no datasource is selected', () => {
    render(<QueryPreviewResults query="up" datasourceId={undefined} />);
    expect(screen.getByText('Nothing to preview yet')).toBeInTheDocument();
    expect(mockRunQueryPreview).not.toHaveBeenCalled();
  });

  it('shows the empty-result warning only after a real run returns zero rows', async () => {
    mockRunQueryPreview.mockResolvedValue({ points: [], query: 'up', seriesCount: 0 });
    render(<QueryPreviewResults query="up" datasourceId="ds-1" runToken={1} />);
    expect(await screen.findByText('No results for this time range')).toBeInTheDocument();
    expect(screen.queryByText('Nothing to preview yet')).not.toBeInTheDocument();
  });

  it('notes when more than one series matched', async () => {
    mockRunQueryPreview.mockResolvedValue({
      points: [{ timestamp: 1, value: 1 }],
      query: 'up',
      seriesCount: 4,
    });
    render(<QueryPreviewResults query="up" datasourceId="ds-1" runToken={1} />);
    await waitFor(() => expect(screen.getByText(/Matched 4 series/)).toBeInTheDocument());
    expect(screen.getByTestId('echarts-render')).toBeInTheDocument();
  });
});
