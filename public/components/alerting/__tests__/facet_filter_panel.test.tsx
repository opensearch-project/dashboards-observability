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

  it('renders an error indicator next to affected options and reveals the message on click', () => {
    const { getByTestId, queryByTestId } = render(
      <FacetFilterGroup {...defaultProps} errorMap={{ active: 'Cluster unreachable (timeout)' }} />
    );
    // The alert-icon button is only present for options in errorMap
    expect(getByTestId('facetGroup-status-error-active')).toBeInTheDocument();
    expect(queryByTestId('facetGroup-status-error-pending')).not.toBeInTheDocument();
    // Popover content is not in the DOM until the icon is clicked
    expect(queryByTestId('facetGroup-status-error-active-popover')).not.toBeInTheDocument();
    fireEvent.click(getByTestId('facetGroup-status-error-active'));
    expect(getByTestId('facetGroup-status-error-active-popover')).toHaveTextContent(
      'Cluster unreachable (timeout)'
    );
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

describe('FacetFilterGroup — accessibility (no nested interactive controls)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the error indicator OUTSIDE the checkbox label (not a nested interactive control)', () => {
    const { getByTestId } = render(
      <FacetFilterGroup {...defaultProps} errorMap={{ active: 'Cluster unreachable (timeout)' }} />
    );
    const errorButton = getByTestId('facetGroup-status-error-active');
    // The interactive error button must not be nested inside a <label> element.
    expect(errorButton.closest('label')).toBeNull();
    // And it must not live inside the option's checkbox label wrapper.
    const checkboxLabel = document.querySelector('label[for="status-active"]');
    expect(checkboxLabel).not.toBeNull();
    expect(checkboxLabel?.contains(errorButton)).toBe(false);
  });

  it('exposes aria-expanded on the header toggle button reflecting the open state', () => {
    const { getByTestId, rerender } = render(
      <FacetFilterGroup {...defaultProps} isCollapsed={false} />
    );
    const toggle = getByTestId('facetGroup-status-toggle');
    // A real <button> element, not a div with role="button".
    expect(toggle.tagName.toLowerCase()).toBe('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    rerender(<FacetFilterGroup {...defaultProps} isCollapsed={true} />);
    expect(getByTestId('facetGroup-status-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('wires aria-controls on the toggle to the id/role="region" of the options region', () => {
    const { getByTestId, container } = render(
      <FacetFilterGroup {...defaultProps} isCollapsed={false} />
    );
    const toggle = getByTestId('facetGroup-status-toggle');
    const controls = toggle.getAttribute('aria-controls');
    expect(controls).toBe('facetGroup-status-region');
    const region = container.querySelector(`#${controls}`);
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute('role', 'region');
    expect(region).toHaveAttribute('aria-label', 'Status');
  });

  it('drops aria-controls while collapsed so it never dangles at an unmounted region', () => {
    const { getByTestId, container } = render(
      <FacetFilterGroup {...defaultProps} isCollapsed={true} />
    );
    const toggle = getByTestId('facetGroup-status-toggle');
    // Collapsed: the region is not rendered, so the toggle must not reference it
    // (axe aria-valid-attr-value). aria-expanded conveys the state instead.
    expect(toggle).not.toHaveAttribute('aria-controls');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('#facetGroup-status-region')).toBeNull();
  });

  it('gives the per-option error button a >=24px target via the shared class', () => {
    const { getByTestId } = render(
      <FacetFilterGroup {...defaultProps} errorMap={{ active: 'Cluster unreachable (timeout)' }} />
    );
    // The 24px hit-target rule lives in the shared `.altFacetTarget` SCSS class
    // (jsdom doesn't apply stylesheets, so we assert the class is present).
    expect(getByTestId('facetGroup-status-error-active').className).toContain('altFacetTarget');
  });

  it('toggles the accordion when the header toggle button is clicked', () => {
    const onToggleCollapse = jest.fn();
    const { getByTestId } = render(
      <FacetFilterGroup {...defaultProps} onToggleCollapse={onToggleCollapse} />
    );
    fireEvent.click(getByTestId('facetGroup-status-toggle'));
    expect(onToggleCollapse).toHaveBeenCalledWith('status');
  });

  it('clears the selection without toggling the accordion when Clear is clicked', () => {
    const onChange = jest.fn();
    const onToggleCollapse = jest.fn();
    const { getByTestId } = render(
      <FacetFilterGroup
        {...defaultProps}
        selected={['active']}
        onChange={onChange}
        onToggleCollapse={onToggleCollapse}
      />
    );
    // Clear must be a sibling of the toggle, so activating it never expands/collapses.
    fireEvent.click(getByTestId('facetGroup-status-clear'));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(onToggleCollapse).not.toHaveBeenCalled();
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
