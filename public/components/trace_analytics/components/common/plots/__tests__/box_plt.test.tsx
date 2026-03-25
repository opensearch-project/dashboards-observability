/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { BoxPlt } from '../box_plt';

describe('Box plot component', () => {
  it('renders box plot', async () => {
    const addFilter = jest.fn();
    render(
      <BoxPlt
        plotParams={{
          min: 0,
          max: 100,
          left: 20,
          mid: 50,
          right: 80,
          currPercentileFilter: '',
          addFilter,
        }}
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
