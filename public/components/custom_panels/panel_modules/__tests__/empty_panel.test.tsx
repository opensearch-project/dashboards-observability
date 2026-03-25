/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { EmptyPanelView } from '../empty_panel';

describe('Empty panel view component', () => {
  it('renders empty panel view with disabled popover', () => {
    const addVizDisabled = true;
    const showFlyout = jest.fn();
    render(<EmptyPanelView addVizDisabled={addVizDisabled} showFlyout={showFlyout} />);

    expect(document.body).toMatchSnapshot();
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('renders empty panel view with enabled popover', () => {
    const addVizDisabled = false;
    const showFlyout = jest.fn();
    render(<EmptyPanelView addVizDisabled={addVizDisabled} showFlyout={showFlyout} />);

    expect(document.body).toMatchSnapshot();
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
  });
});
