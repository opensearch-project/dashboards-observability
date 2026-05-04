/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { FacetFilterGroup, FacetFilterGroupProps } from '../facet_filter_panel';

const defaultProps: FacetFilterGroupProps = {
  id: 'status',
  label: 'Status',
  options: ['active', 'error', 'pending'],
  selected: [],
  onChange: jest.fn(),
  counts: { active: 5, error: 2, pending: 1 },
  isCollapsed: false,
  onToggleCollapse: jest.fn(),
};

describe('FacetFilterGroup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders options with counts', () => {
    const { getByText } = render(<FacetFilterGroup {...defaultProps} />);
    expect(getByText('active')).toBeInTheDocument();
    expect(getByText('(5)')).toBeInTheDocument();
    expect(getByText('error')).toBeInTheDocument();
  });

  it('calls onChange when a checkbox is clicked', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<FacetFilterGroup {...defaultProps} onChange={onChange} />);
    fireEvent.click(getByLabelText(/active/));
    expect(onChange).toHaveBeenCalledWith(['active']);
  });

  it('fires onCapReached instead of selecting when maxSelected is reached', () => {
    const onCapReached = jest.fn();
    const onChange = jest.fn();
    const { getByLabelText, queryByTestId } = render(
      <FacetFilterGroup
        {...defaultProps}
        selected={['active']}
        maxSelected={1}
        onChange={onChange}
        onCapReached={onCapReached}
      />
    );
    // Click an unchecked option while at cap
    fireEvent.click(getByLabelText(/error/));
    expect(onCapReached).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    // "Maximum N" helper text should be suppressed when onCapReached is provided
    expect(queryByTestId('facetGroup-status-cap-helper')).not.toBeInTheDocument();
  });
});
