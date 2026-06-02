/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, fireEvent } from '@testing-library/react';
import { FacetFilterGroup, FacetFilterGroupProps, useFacetCollapse } from '../facet_filter_panel';

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

  it('renders a per-facet Clear link when there is an active selection and clears on click', () => {
    const onChange = jest.fn();
    const { getByTestId, queryByTestId, rerender } = render(
      <FacetFilterGroup {...defaultProps} selected={['active']} onChange={onChange} />
    );
    const clearLink = getByTestId('facetGroup-status-clear');
    expect(clearLink).toBeInTheDocument();
    fireEvent.click(clearLink);
    expect(onChange).toHaveBeenCalledWith([]);
    // After the parent applies the empty selection, the link disappears
    rerender(<FacetFilterGroup {...defaultProps} selected={[]} onChange={onChange} />);
    expect(queryByTestId('facetGroup-status-clear')).not.toBeInTheDocument();
  });

  it('caps rendered options at initialVisible and toggles "+N more" / "Show less"', () => {
    const props: FacetFilterGroupProps = {
      ...defaultProps,
      options: ['a', 'b', 'c', 'd', 'e'],
      counts: { a: 1, b: 2, c: 3, d: 4, e: 5 },
      initialVisible: 2,
    };
    const { getByTestId, getByText, queryByText } = render(<FacetFilterGroup {...props} />);
    // Only first 2 rendered
    expect(getByText('a')).toBeInTheDocument();
    expect(getByText('b')).toBeInTheDocument();
    expect(queryByText('c')).not.toBeInTheDocument();
    // "+3 more" toggle visible
    const toggle = getByTestId('facetGroup-status-showMore');
    expect(toggle).toHaveTextContent('+3 more');
    fireEvent.click(toggle);
    expect(getByText('c')).toBeInTheDocument();
    expect(getByTestId('facetGroup-status-showMore')).toHaveTextContent('Show less');
  });
});

describe('useFacetCollapse', () => {
  it('honors per-call defaultCollapsed when no override is set, then persists toggles', () => {
    let snapshot: ReturnType<typeof useFacetCollapse> | null = null;
    const Probe: React.FC = () => {
      snapshot = useFacetCollapse();
      return null;
    };
    render(<Probe />);

    // No override yet → both reads honor their per-call defaults
    expect(snapshot!.isCollapsed('static-facet')).toBe(false);
    expect(snapshot!.isCollapsed('dynamic-facet', true)).toBe(true);

    // Toggling a dynamic-default-collapsed facet flips it to expanded (override = false)
    act(() => snapshot!.toggleFacetCollapse('dynamic-facet', true));
    expect(snapshot!.isCollapsed('dynamic-facet', true)).toBe(false);

    // Toggling again returns to collapsed
    act(() => snapshot!.toggleFacetCollapse('dynamic-facet', true));
    expect(snapshot!.isCollapsed('dynamic-facet', true)).toBe(true);
  });
});

describe('FacetFilterGroup — search matches both display label and raw value', () => {
  it('filters by raw option value when displayMap provides a different label', () => {
    const props: FacetFilterGroupProps = {
      ...defaultProps,
      options: ['field_a', 'field_b', 'field_c'],
      counts: { field_a: 3, field_b: 2, field_c: 1 },
      displayMap: { field_a: 'Alpha', field_b: 'Beta', field_c: 'Charlie' },
      searchable: true,
    };
    const { getByRole, queryByText, getByText } = render(<FacetFilterGroup {...props} />);
    const searchBox = getByRole('searchbox');

    // Search by display label — should match
    fireEvent.change(searchBox, { target: { value: 'Alpha' } });
    expect(getByText('Alpha')).toBeInTheDocument();
    expect(queryByText('Beta')).not.toBeInTheDocument();

    // Search by raw field name — should also match (the fix)
    fireEvent.change(searchBox, { target: { value: 'field_b' } });
    expect(getByText('Beta')).toBeInTheDocument();
    expect(queryByText('Alpha')).not.toBeInTheDocument();
  });
});
