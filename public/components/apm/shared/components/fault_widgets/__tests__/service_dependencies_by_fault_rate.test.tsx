/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ServiceDependenciesByFaultRate,
  ServiceDependenciesByFaultRateProps,
} from '../service_dependencies_by_fault_rate';

// Mock the useServiceDependenciesByFaultRate hook
const mockUseServiceDependenciesByFaultRate = jest.fn();
jest.mock('../../../hooks/use_service_dependencies_by_fault_rate', () => ({
  useServiceDependenciesByFaultRate: (params: any) => mockUseServiceDependenciesByFaultRate(params),
}));

// Mock time_utils
jest.mock('../../../utils/time_utils', () => ({
  parseTimeRange: jest.fn(() => ({
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
  })),
}));

describe('ServiceDependenciesByFaultRate', () => {
  const defaultProps: ServiceDependenciesByFaultRateProps = {
    serviceName: 'frontend',
    environment: 'production',
    timeRange: {
      from: 'now-1h',
      to: 'now',
    },
  };

  const mockDependencies = [
    { remoteService: 'cart', faultRate: 5.5 },
    { remoteService: 'payment', faultRate: 3.2 },
    { remoteService: 'shipping', faultRate: 1.8 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseServiceDependenciesByFaultRate.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
  });

  describe('loading state', () => {
    it('should show loading spinner when loading', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      const { container } = render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      expect(container.querySelector('.euiLoadingSpinner')).toBeInTheDocument();
    });

    it('should show title during loading', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      expect(screen.getByText('Top Dependencies by Fault Rate')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should display Prometheus required message for config error', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('No Prometheus connection configured'),
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      expect(
        screen.getByText(
          'Prometheus connection required. Configure a Prometheus data source to view dependency fault rate metrics.'
        )
      ).toBeInTheDocument();
    });

    it('should display Prometheus required message for auth error', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Unauthorized access'),
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      expect(
        screen.getByText(
          'Prometheus connection required. Configure a Prometheus data source to view dependency fault rate metrics.'
        )
      ).toBeInTheDocument();
    });

    it('should display generic error message for other errors', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Query timeout'),
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      expect(
        screen.getByText('Error loading dependency fault rate data: Query timeout')
      ).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show no data message when dependencies is empty', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      expect(screen.getByText('No dependency fault rate data available')).toBeInTheDocument();
    });

    it('should show no data message when dependencies is null', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      expect(screen.getByText('No dependency fault rate data available')).toBeInTheDocument();
    });
  });

  describe('successful data rendering', () => {
    it('should render title', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: mockDependencies,
        isLoading: false,
        error: null,
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      expect(screen.getByText('Top Dependencies by Fault Rate')).toBeInTheDocument();
    });

    it('should render dependency services', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: mockDependencies,
        isLoading: false,
        error: null,
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      expect(screen.getByText('cart')).toBeInTheDocument();
      expect(screen.getByText('payment')).toBeInTheDocument();
      expect(screen.getByText('shipping')).toBeInTheDocument();
    });

    it('should render fault rate percentages', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: mockDependencies,
        isLoading: false,
        error: null,
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      expect(screen.getByText('5.50%')).toBeInTheDocument();
      expect(screen.getByText('3.20%')).toBeInTheDocument();
      expect(screen.getByText('1.80%')).toBeInTheDocument();
    });

    it('should render table with columns', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: mockDependencies,
        isLoading: false,
        error: null,
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      // EuiBasicTable renders column headers multiple times (for mobile and desktop)
      expect(screen.getAllByText('Dependency Service').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Fault Rate').length).toBeGreaterThan(0);
    });
  });

  describe('interactions', () => {
    it('should call onDependencyClick when dependency link is clicked', () => {
      const mockOnDependencyClick = jest.fn();
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: mockDependencies,
        isLoading: false,
        error: null,
      });

      render(
        <ServiceDependenciesByFaultRate
          {...defaultProps}
          onDependencyClick={mockOnDependencyClick}
        />
      );

      fireEvent.click(screen.getByText('cart'));

      expect(mockOnDependencyClick).toHaveBeenCalledWith('cart');
    });

    it('should not throw when clicking dependency without onDependencyClick handler', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: mockDependencies,
        isLoading: false,
        error: null,
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      // Should not throw
      expect(() => fireEvent.click(screen.getByText('cart'))).not.toThrow();
    });
  });

  describe('hook parameters', () => {
    it('should pass correct parameters to hook', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} refreshTrigger={5} />);

      expect(mockUseServiceDependenciesByFaultRate).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: 'frontend',
          environment: 'production',
          limit: 5,
          refreshTrigger: 5,
        })
      );
    });

    it('should use limit of 5 by default', () => {
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      expect(mockUseServiceDependenciesByFaultRate).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 5,
        })
      );
    });
  });

  describe('relative percentage calculation', () => {
    it('should calculate relative percentages based on fault rate sum', () => {
      // faultRates: 5.5, 3.2, 1.8 = sum 10.5
      // Relative percentages: 5.5/10.5*100 = 52.38%, 3.2/10.5*100 = 30.48%, 1.8/10.5*100 = 17.14%
      mockUseServiceDependenciesByFaultRate.mockReturnValue({
        data: mockDependencies,
        isLoading: false,
        error: null,
      });

      const { container } = render(<ServiceDependenciesByFaultRate {...defaultProps} />);

      // Check that progress bars are rendered
      const progressBars = container.querySelectorAll('.euiProgress');
      expect(progressBars).toHaveLength(3);
    });
  });
});
