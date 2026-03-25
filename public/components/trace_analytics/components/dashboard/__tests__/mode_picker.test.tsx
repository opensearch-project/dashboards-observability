/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { DataSourcePicker } from '../mode_picker';

describe('Mode picker component', () => {
  const modes = [
    { id: 'jaeger', title: 'Jaeger' },
    { id: 'data_prepper', title: 'Data Prepper' },
  ];

  it('renders mode picker', async () => {
    const setMode = jest.fn();
    const { container } = render(
      <DataSourcePicker modes={modes} selectedMode={'jaeger'} setMode={setMode} />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });

    const triggerButton = container.querySelector('.dscIndexPattern__triggerButton');
    if (triggerButton) {
      fireEvent.click(triggerButton);

      await waitFor(() => {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(document.body).toMatchSnapshot();
      });
    }
  });
});
