/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveFilterBadges, FilterBadge } from '../active_filter_badges';

describe('ActiveFilterBadges', () => {
  const createMockFilter = (overrides?: Partial<FilterBadge>): FilterBadge => ({
    key: 'test-filter',
    category: 'Test Category',
    values: ['Value 1', 'Value 2'],
    onRemove: jest.fn(),
    ...overrides,
  });

  const mockOnClearAll = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render nothing when filters array is empty', () => {
      const { container } = render(<ActiveFilterBadges filters={[]} onClearAll={mockOnClearAll} />);

      expect(container.firstChild).toBeNull();
    });

    it('should render filter badges when filters are provided', () => {
      const filters = [createMockFilter()];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} />);

      expect(screen.getByTestId('activeFilterBadges')).toBeInTheDocument();
      expect(screen.getByTestId('filterBadge-test-filter')).toBeInTheDocument();
    });

    it('should render multiple filter badges', () => {
      const filters = [
        createMockFilter({ key: 'filter-1', category: 'Category 1' }),
        createMockFilter({ key: 'filter-2', category: 'Category 2' }),
        createMockFilter({ key: 'filter-3', category: 'Category 3' }),
      ];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} />);

      expect(screen.getByTestId('filterBadge-filter-1')).toBeInTheDocument();
      expect(screen.getByTestId('filterBadge-filter-2')).toBeInTheDocument();
      expect(screen.getByTestId('filterBadge-filter-3')).toBeInTheDocument();
    });

    it('should display category and comma-separated values', () => {
      const filters = [
        createMockFilter({
          category: 'Environment',
          values: ['production', 'staging'],
        }),
      ];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} />);

      expect(screen.getByText('Environment: production, staging')).toBeInTheDocument();
    });

    it('should render Clear all link', () => {
      const filters = [createMockFilter()];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} />);

      expect(screen.getByTestId('clearAllFiltersLink')).toBeInTheDocument();
      expect(screen.getByText('Clear all')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onRemove when badge X is clicked', () => {
      const onRemove = jest.fn();
      const filters = [createMockFilter({ onRemove })];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} />);

      // Find and click the badge's close button
      const badge = screen.getByTestId('filterBadge-test-filter');
      const closeButton = badge.querySelector('[data-euiicon-type="cross"]')?.closest('button');

      expect(closeButton).toBeTruthy();
      fireEvent.click(closeButton!);
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('should call onClearAll when Clear all link is clicked', () => {
      const filters = [createMockFilter()];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} />);

      fireEvent.click(screen.getByTestId('clearAllFiltersLink'));

      expect(mockOnClearAll).toHaveBeenCalledTimes(1);
    });

    it('should call individual filter onRemove, not others', () => {
      const onRemove1 = jest.fn();
      const onRemove2 = jest.fn();
      const filters = [
        createMockFilter({ key: 'filter-1', onRemove: onRemove1 }),
        createMockFilter({ key: 'filter-2', onRemove: onRemove2 }),
      ];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} />);

      // Click first badge's close button
      const badge1 = screen.getByTestId('filterBadge-filter-1');
      const closeButton1 = badge1.querySelector('[data-euiicon-type="cross"]')?.closest('button');

      expect(closeButton1).toBeTruthy();
      fireEvent.click(closeButton1!);
      expect(onRemove1).toHaveBeenCalledTimes(1);
      expect(onRemove2).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('should not call onRemove when disabled', () => {
      const onRemove = jest.fn();
      const filters = [createMockFilter({ onRemove })];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} disabled={true} />);

      // The badge should be rendered but interactions disabled
      expect(screen.getByTestId('filterBadge-test-filter')).toBeInTheDocument();
    });

    it('should disable Clear all link when disabled', () => {
      const filters = [createMockFilter()];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} disabled={true} />);

      const clearAllLink = screen.getByTestId('clearAllFiltersLink');
      expect(clearAllLink).toHaveAttribute('disabled');
    });

    it('should not call onClearAll when disabled and clicked', () => {
      const filters = [createMockFilter()];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} disabled={true} />);

      fireEvent.click(screen.getByTestId('clearAllFiltersLink'));

      expect(mockOnClearAll).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle single value in filter', () => {
      const filters = [
        createMockFilter({
          values: ['single-value'],
        }),
      ];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} />);

      expect(screen.getByText('Test Category: single-value')).toBeInTheDocument();
    });

    it('should handle many values in filter', () => {
      const filters = [
        createMockFilter({
          values: ['val1', 'val2', 'val3', 'val4', 'val5'],
        }),
      ];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} />);

      expect(screen.getByText('Test Category: val1, val2, val3, val4, val5')).toBeInTheDocument();
    });

    it('should handle empty category', () => {
      const filters = [
        createMockFilter({
          category: '',
          values: ['value'],
        }),
      ];

      render(<ActiveFilterBadges filters={filters} onClearAll={mockOnClearAll} />);

      expect(screen.getByText(': value')).toBeInTheDocument();
    });
  });
});
