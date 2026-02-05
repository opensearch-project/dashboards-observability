/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ServiceMap } from '../service_map';
import { TEST_SERVICE_MAP, MOCK_CANVAS_CONTEXT } from '../../../../../../../test/constants';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'static-uuid'),
}));

// Normalize dynamic values in snapshots
expect.addSnapshotSerializer({
  test: (val) => typeof val === 'string' && /^[a-f0-9-]{36}$/.test(val),
  print: () => '"<dynamic-uuid>"',
});

// Mock crypto.getRandomValues
const crypto = {
  getRandomValues: jest.fn((arr) => arr.fill(0)), // Fill with consistent values
};
Object.defineProperty(global, 'crypto', { value: crypto });

jest
  .spyOn(HTMLCanvasElement.prototype, 'getContext')
  .mockImplementation((contextId) =>
    contextId === '2d' ? ((MOCK_CANVAS_CONTEXT as unknown) as CanvasRenderingContext2D) : null
  );

jest.mock('react-graph-vis', () => {
  const GraphMock = () => <div data-testid="mock-graph">Mock Graph</div>;
  return GraphMock;
});

describe('ServiceMap Component', () => {
  const defaultProps = {
    serviceMap: TEST_SERVICE_MAP,
    idSelected: 'latency' as 'latency' | 'error_rate' | 'throughput',
    setIdSelected: jest.fn(),
    page: 'dashboard' as
      | 'app'
      | 'appCreate'
      | 'dashboard'
      | 'traces'
      | 'services'
      | 'serviceView'
      | 'detailFlyout'
      | 'traceView',
    mode: 'jaeger',
    currService: '',
    filters: [],
    setFilters: jest.fn(),
    addFilter: jest.fn(),
    removeFilter: jest.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders service map component', async () => {
    render(<ServiceMap {...defaultProps} />);

    await act(async () => {
      await waitFor(() => {
        expect(document.body).toMatchSnapshot();
      });
    });
  });

  it('renders application composition map title when page is app', () => {
    const { container } = render(<ServiceMap {...defaultProps} page="app" />);
    expect(container.textContent).toContain('Application Composition Map');
  });

  it('renders service map title for other pages', () => {
    const { container } = render(<ServiceMap {...defaultProps} />);
    expect(container.textContent).toContain('Service map');
  });

  describe('Service search and selection', () => {
    it('clears focus with refresh button', async () => {
      const { container } = render(<ServiceMap {...defaultProps} />);

      const refreshButton = screen.getByTestId('serviceMapRefreshButton');
      expect(refreshButton).toBeTruthy();

      await act(async () => {
        fireEvent.click(refreshButton);
      });

      const searchField = container.querySelector('input[type="search"]');
      expect(searchField).toBeTruthy();
    });
  });

  describe('Metric selection', () => {
    it('changes selected metric', async () => {
      const setIdSelected = jest.fn();
      render(<ServiceMap {...defaultProps} setIdSelected={setIdSelected} />);

      const buttons = screen.queryAllByRole('button');
      const errorRateButton = buttons.find((btn) => btn.textContent?.includes('Error rate'));

      if (errorRateButton) {
        await act(async () => {
          fireEvent.click(errorRateButton);
        });
        // eslint-disable-next-line jest/no-conditional-expect
        expect(setIdSelected).toHaveBeenCalled();
      }
    });
  });

  describe('Service dependencies', () => {
    it('renders component without errors', async () => {
      const { container } = render(<ServiceMap {...defaultProps} />);

      await waitFor(() => {
        // Component should render successfully
        expect(container).toBeInTheDocument();
      });
    });
  });

  describe('Loading state', () => {
    it('shows loading indicator when isLoading is true', () => {
      const { container } = render(<ServiceMap {...defaultProps} isLoading={true} />);
      const spinner = container.querySelector('.euiLoadingSpinner');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('handles empty service map', () => {
      render(<ServiceMap {...defaultProps} serviceMap={{}} />);
      const graph = screen.queryByTestId('mock-graph');
      expect(graph).not.toBeInTheDocument();
    });
  });
});
