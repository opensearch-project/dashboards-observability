/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';

import { AlertsSummaryCards, AlertsSummaryCardsProps } from '../alerts_summary_cards';

const baseProps = (overrides: Partial<AlertsSummaryCardsProps> = {}): AlertsSummaryCardsProps => ({
  filteredCount: 42,
  totalCount: 100,
  activeCount: 17,
  severityCounts: { critical: 5, high: 8, medium: 12, low: 3, info: 1 },
  severityFilter: 'all',
  stateFilter: 'all',
  filtersSeverityLength: 0,
  filtersStateLength: 0,
  isFiltered: false,
  onShowAll: jest.fn(),
  onToggleActive: jest.fn(),
  onToggleCritical: jest.fn(),
  onToggleHigh: jest.fn(),
  onToggleMedium: jest.fn(),
  ...overrides,
});

describe('AlertsSummaryCards', () => {
  it('renders each card with the expected counts from props', () => {
    const { getByTestId, getByText } = render(<AlertsSummaryCards {...baseProps()} />);

    expect(getByTestId('alertStatCardTotal')).toHaveTextContent('42');
    expect(getByTestId('alertStatCardTotal')).toHaveTextContent('Total Alerts');
    expect(getByTestId('alertStatCardActive')).toHaveTextContent('17');
    expect(getByTestId('alertStatCardCritical')).toHaveTextContent('5');
    expect(getByTestId('alertStatCardHigh')).toHaveTextContent('8');
    // Medium card sums medium + low + info: 12 + 3 + 1 = 16.
    expect(getByTestId('alertStatCardMedium')).toHaveTextContent('16');
    expect(getByText('Medium / Low')).toBeInTheDocument();
  });

  it('shows the "of N Total Alerts" label when isFiltered is true', () => {
    const { getByTestId } = render(
      <AlertsSummaryCards {...baseProps({ isFiltered: true, filteredCount: 7 })} />
    );
    expect(getByTestId('alertStatCardTotal')).toHaveTextContent('of 100 Total Alerts');
  });

  it('invokes the matching toggle callback when a severity card is clicked', () => {
    const onToggleCritical = jest.fn();
    const onToggleHigh = jest.fn();
    const { getByTestId } = render(
      <AlertsSummaryCards {...baseProps({ onToggleCritical, onToggleHigh })} />
    );

    fireEvent.click(getByTestId('alertStatCardCritical'));
    fireEvent.click(getByTestId('alertStatCardHigh'));

    expect(onToggleCritical).toHaveBeenCalledTimes(1);
    expect(onToggleHigh).toHaveBeenCalledTimes(1);
  });

  it('shows a "Filtered" marker on the active card when stateFilter is "active"', () => {
    const { getByTestId } = render(
      <AlertsSummaryCards {...baseProps({ stateFilter: 'active' })} />
    );
    expect(getByTestId('alertStatCardActive')).toHaveTextContent('Filtered');
  });
});
