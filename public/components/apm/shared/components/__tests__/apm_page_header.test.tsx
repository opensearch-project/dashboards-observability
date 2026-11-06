/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ApmPageHeader } from '../apm_page_header';

jest.mock('../time_filter', () => ({
  TimeRangePicker: () => <div data-test-subj="stubTimeRangePicker" />,
}));

const props = {
  timeRange: { from: 'now-15m', to: 'now' },
  onTimeChange: jest.fn(),
  onRefresh: jest.fn(),
};

describe('ApmPageHeader', () => {
  it('uses the default search placeholder', () => {
    render(<ApmPageHeader {...props} />);
    expect(screen.getByTestId('servicesSearchBar')).toHaveAttribute(
      'placeholder',
      'Filter by service name or environment'
    );
  });

  it('takes a page-specific placeholder and controls before the search bar', () => {
    render(
      <ApmPageHeader
        {...props}
        searchPlaceholder="Find in this view by service or environment"
        prepend={<div data-test-subj="prepended" />}
      />
    );
    expect(screen.getByTestId('servicesSearchBar')).toHaveAttribute(
      'placeholder',
      'Find in this view by service or environment'
    );
    expect(screen.getByTestId('prepended')).toBeInTheDocument();
  });

  it('can show the search bar disabled', () => {
    render(<ApmPageHeader {...props} searchDisabled />);
    expect(screen.getByTestId('servicesSearchBar')).toBeDisabled();
  });
});
