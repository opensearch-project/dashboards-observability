/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FilterEditPopover } from '../filter_edit_popover';
import { getFilterFields } from '../filter_helpers';

describe('Filter popover component', () => {
  it('renders filter popover', async () => {
    const setFilter = jest.fn();
    const closePopover = jest.fn();
    const filterFieldOptions = getFilterFields('data_prepper', 'dashboard', [
      'resource.attribute.language',
      'service.attribute@scope',
    ]).map((field) => ({ label: field }));
    const { container } = render(
      <FilterEditPopover
        filterFieldOptions={filterFieldOptions}
        index={0}
        setFilter={setFilter}
        closePopover={closePopover}
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });

    const inputs = container.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'traceGroup' } });
    fireEvent.change(inputs[1], { target: { value: 'exists' } });

    const cancelButton = screen.getByTestId('filter-popover-cancel-button');
    fireEvent.click(cancelButton);

    expect(closePopover).toBeCalled();

    const toggleButtons = screen.getAllByTestId('comboBoxToggleListButton');
    fireEvent.click(toggleButtons[0]);
  });
});
